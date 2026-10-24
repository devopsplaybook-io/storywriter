import { TarArchive } from "archiver";
import * as tar from "tar";
import * as fs from "fs-extra";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Config } from "../Config";
import { Book } from "../model/Book";
import { Section } from "../model/Section";
import { BookAttribute } from "../model/BookAttribute";
import { Property } from "../model/Property";
import { SafeJoin, IsSafePathSegment } from "../utils/SafePath";
import { DbUtilsTransaction } from "../utils/DbTransaction";
import { BooksDataGet, BooksDataAdd, BooksDataSetAccess } from "./BooksData";
import {
  SectionsDataListByBook,
  SectionsDataAdd,
} from "../sections/SectionsData";
import {
  BookAttributesDataListByBook,
  BookAttributesDataAdd,
} from "../attributes/BookAttributesData";
import {
  PropertiesDataListByBook,
  PropertiesDataGetSectionValues,
  PropertiesDataAdd,
  PropertiesDataSetSectionValue,
} from "../properties/PropertiesData";
import { MediaDataList, MediaDataAdd, Media } from "../media/MediaData";
import { GenerateMediaFilename, SanitizeOriginalFilename, MatchesMagicBytes } from "../media/MediaValidation";
import {
  IMPORT_LIMITS,
  ImportValidationError,
  ValidateArchiveEntries,
  ValidateManifest,
  ValidateBook,
  ValidateSections,
  ValidateProperties,
  ValidateAttributes,
  ValidateSectionProperties,
  ValidateMediaMetadata,
  ValidateMediaFiles,
} from "./BookArchiveValidation";

const EXPORT_VERSION = "2.0";

// ==================== EXPORT ====================

/**
 * Build the export archive into a temp file and resolve with its path. Media
 * referenced by the database must exist on disk: a missing file fails the
 * export instead of silently producing an incomplete backup.
 */
export async function BookExportRun(
  bookId: string,
  config: Config,
): Promise<string> {
  const book = await BooksDataGet(bookId);
  if (!book) {
    throw new Error("Book not found");
  }

  // Gather all data
  const sections = await SectionsDataListByBook(bookId);
  const attributes = await BookAttributesDataListByBook(bookId);
  const properties = await PropertiesDataListByBook(bookId);

  const sectionProperties: {
    sectionId: string;
    propertyId: string;
    value: string;
  }[] = [];
  for (const section of sections) {
    const values = await PropertiesDataGetSectionValues(section.id);
    for (const val of values) {
      sectionProperties.push({
        sectionId: section.id,
        propertyId: val.propertyId,
        value: val.value,
      });
    }
  }

  const mediaItems = await MediaDataList(bookId);

  // Normalize archive media names: never write a stored filename into the
  // archive unless it is a safe single path segment.
  const archiveMediaName = new Map<string, string>();
  for (const media of mediaItems) {
    const name = IsSafePathSegment(media.filename)
      ? media.filename
      : GenerateMediaFilename(media.id, media.mimeType);
    archiveMediaName.set(media.id, name);
  }
  const mediaMetadata = mediaItems.map((m) => ({
    ...m,
    filename: archiveMediaName.get(m.id),
  }));

  // Build JSON data
  const manifest = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    bookName: book.name,
  };

  const exportData = {
    manifest,
    book: book.toJson(),
    sections: sections.map((s) => s.toJson()),
    attributes: attributes.map((a) => a.toJson()),
    properties: properties.map((p) => p.toJson()),
    sectionProperties,
    mediaMetadata,
  };

  await fs.ensureDir(config.TMP_DIR);
  const tmpFile = SafeJoin(config.TMP_DIR, `export-${uuidv4()}.tar.gz`);
  const output = fs.createWriteStream(tmpFile);

  // Create archive — TarArchive extends stream.Transform (readable + writable).
  // Errors are surfaced through `finished`; nothing is thrown from an event
  // callback (an EventEmitter callback throw escapes route try/catch blocks).
  const archive = new TarArchive({
    gzip: true,
    gzipOptions: { level: 6 },
  });

  const finished = new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      archive.destroy();
      output.destroy();
      reject(err);
    };
    archive.on("error", fail);
    output.on("error", fail);
    output.on("close", () => resolve());
  });

  archive.pipe(output);

  try {
    // Add JSON files
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.append(JSON.stringify(exportData.book, null, 2), {
      name: "book.json",
    });
    archive.append(JSON.stringify(exportData.sections, null, 2), {
      name: "sections.json",
    });
    archive.append(JSON.stringify(exportData.attributes, null, 2), {
      name: "attributes.json",
    });
    archive.append(JSON.stringify(exportData.properties, null, 2), {
      name: "properties.json",
    });
    archive.append(JSON.stringify(exportData.sectionProperties, null, 2), {
      name: "section-properties.json",
    });
    archive.append(JSON.stringify(exportData.mediaMetadata, null, 2), {
      name: "media-metadata.json",
    });

    // Add media files from disk
    for (const media of mediaItems) {
      const mediaDir = SafeJoin(config.DATA_DIR, "media", bookId, media.id);
      const name = archiveMediaName.get(media.id);
      const filePath = path.join(mediaDir, name);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Export failed: media file missing for media ${media.id} (${name})`,
        );
      }
      archive.file(filePath, { name: `media/${media.id}/${name}` });
    }

    await Promise.all([archive.finalize(), finished]);
    return tmpFile;
  } catch (err) {
    archive.destroy();
    output.destroy();
    await fs.remove(tmpFile).catch(() => undefined);
    throw err;
  }
}

// ==================== IMPORT ====================

async function ReadArchiveJson(
  tmpDir: string,
  name: string,
  required: boolean,
): Promise<unknown> {
  const filePath = SafeJoin(tmpDir, name);
  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new ImportValidationError(`Invalid archive: ${name} not found`);
    }
    return null;
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    throw new ImportValidationError(`Invalid archive: ${name} is not valid JSON`);
  }
}

export async function BookImportRun(
  archiveBuffer: Buffer,
  config: Config,
  ownerId: string,
): Promise<Book> {
  const tmpDir = path.join(config.TMP_DIR, `import-${uuidv4()}`);
  let stagedBookId: string | null = null;

  try {
    await fs.ensureDir(tmpDir);
    const archivePath = path.join(tmpDir, "archive.tar.gz");
    await fs.writeFile(archivePath, archiveBuffer);

    // First pass: list every entry and validate the archive shape.
    const entries: { path: string; size: number; type: string }[] = [];
    try {
      await tar.list({
        file: archivePath,
        gzip: true,
        strict: true,
        preservePaths: false,
        maxDecompressionRatio: IMPORT_LIMITS.MAX_GZIP_RATIO,
        onReadEntry: (entry) => {
          entries.push({
            path: entry.path,
            size: entry.size,
            type: entry.type,
          });
        },
      });
    } catch (err) {
      throw new ImportValidationError(
        `Invalid archive: ${(err as Error).message}`,
      );
    }
    const allowedEntries = ValidateArchiveEntries(entries, archiveBuffer.length);

    // Second pass: extract only the validated entries.
    try {
      await tar.extract({
        file: archivePath,
        cwd: tmpDir,
        gzip: true,
        strict: true,
        preservePaths: false,
        maxDecompressionRatio: IMPORT_LIMITS.MAX_GZIP_RATIO,
        filter: (entryPath: string) => allowedEntries.has(entryPath),
      });
    } catch (err) {
      throw new ImportValidationError(
        `Invalid archive: ${(err as Error).message}`,
      );
    }

    // Read JSON files (required ones must exist, optional ones default to []).
    const manifest = await ReadArchiveJson(tmpDir, "manifest.json", true);
    ValidateManifest(manifest);
    const bookData = await ReadArchiveJson(tmpDir, "book.json", true);
    ValidateBook(bookData);
    const sectionsData = await ReadArchiveJson(tmpDir, "sections.json", true);
    const attributesData =
      (await ReadArchiveJson(tmpDir, "attributes.json", false)) || [];
    const propertiesData =
      (await ReadArchiveJson(tmpDir, "properties.json", false)) || [];
    const sectionPropertiesData =
      (await ReadArchiveJson(tmpDir, "section-properties.json", false)) || [];
    const mediaMetadataData =
      (await ReadArchiveJson(tmpDir, "media-metadata.json", false)) || [];
    // Legacy files are tolerated and ignored (tables dropped in init-0002).
    await ReadArchiveJson(tmpDir, "section-versions.json", false);
    await ReadArchiveJson(tmpDir, "attribute-versions.json", false);

    // Schema validation
    ValidateMediaMetadata(mediaMetadataData);
    const mediaIds = new Set(
      (mediaMetadataData as Record<string, unknown>[]).map((m) => m.id as string),
    );
    const mediaFileEntries = new Map<string, number>();
    for (const entry of entries) {
      const match = /^media\/([^/]+)\/([^/]+)$/.exec(entry.path);
      if (match && entry.type === "File") {
        mediaFileEntries.set(entry.path, entry.size);
      }
    }
    ValidateMediaFiles(mediaFileEntries, mediaMetadataData as Record<string, unknown>[]);
    const orderedSections = ValidateSections(sectionsData, mediaIds);
    ValidateAttributes(attributesData);
    ValidateProperties(propertiesData);
    const sectionIds = new Set(orderedSections.map((s) => s.id as string));
    const propertyIds = new Set(
      (propertiesData as Record<string, unknown>[]).map((p) => p.id as string),
    );
    ValidateSectionProperties(sectionPropertiesData, sectionIds, propertyIds);

    // Create new book
    const newBook = new Book();
    newBook.name = (bookData as Record<string, unknown>).name as string;
    newBook.description =
      ((bookData as Record<string, unknown>).description as string) || "";
    newBook.dateCreated =
      ((bookData as Record<string, unknown>).dateCreated as string) ||
      new Date().toISOString();
    newBook.writingGoal = Math.max(
      0,
      Math.floor(
        Number((bookData as Record<string, unknown>).writingGoal) || 0,
      ),
    );
    newBook.ownerId = ownerId || null;
    stagedBookId = newBook.id;

    // Build ID maps (old → new)
    const sectionIdMap = new Map<string, string>();
    const propertyIdMap = new Map<string, string>();
    const mediaIdMap = new Map<string, string>();
    const attributeIdMap = new Map<string, string>();

    for (const mediaMeta of mediaMetadataData as Record<string, unknown>[]) {
      mediaIdMap.set(mediaMeta.id as string, uuidv4());
    }
    for (const sec of orderedSections) {
      sectionIdMap.set(sec.id as string, uuidv4());
    }
    for (const prop of propertiesData as Record<string, unknown>[]) {
      propertyIdMap.set(prop.id as string, uuidv4());
    }
    for (const attr of attributesData as Record<string, unknown>[]) {
      attributeIdMap.set(attr.id as string, uuidv4());
    }

    // Stage validated media files into the new book's media dir (server
    // generated filenames — archive names are never used as filesystem paths).
    const newBookMediaDir = SafeJoin(config.DATA_DIR, "media", newBook.id);
    for (const mediaMeta of mediaMetadataData as Record<string, unknown>[]) {
      const newMediaId = mediaIdMap.get(mediaMeta.id as string);
      const mimeType = mediaMeta.mimeType as string;
      const newFilename = GenerateMediaFilename(newMediaId, mimeType);
      const srcPath = SafeJoin(
        tmpDir,
        "media",
        mediaMeta.id as string,
        mediaMeta.filename as string,
      );
      const buffer = await fs.readFile(srcPath);
      if (buffer.length !== mediaMeta.size) {
        throw new ImportValidationError(
          `Invalid archive: media file size mismatch for media ${mediaMeta.id as string}`,
        );
      }
      if (!MatchesMagicBytes(buffer, mimeType)) {
        throw new ImportValidationError(
          `Invalid archive: media file content does not match its MIME type (${mimeType})`,
        );
      }
      const destDir = SafeJoin(newBookMediaDir, newMediaId);
      await fs.ensureDir(destDir);
      await fs.writeFile(path.join(destDir, newFilename), buffer);
    }

    // Ensure media slugs are unique within the imported batch.
    const usedSlugs = new Set<string>();
    const slugFor = (mediaMeta: Record<string, unknown>): string => {
      let base = SanitizeOriginalFilename(mediaMeta.slug as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 150);
      if (!base) {
        base = SanitizeOriginalFilename(mediaMeta.filename as string)
          .toLowerCase()
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 150);
      }
      if (!base) {
        base = "media";
      }
      let candidate = base;
      let counter = 1;
      while (usedSlugs.has(candidate)) {
        candidate = `${base}-${counter}`;
        counter++;
      }
      usedSlugs.add(candidate);
      return candidate;
    };

    // Single transaction: the book is either fully imported or not at all.
    // DB work only — media files were staged above and temp cleanup happens
    // outside the transaction.
    await DbUtilsTransaction(async () => {
      await BooksDataAdd(newBook);

      // Sections in parent-first order, preserving content and AI notes.
      for (const sec of orderedSections) {
        const section = Section.fromJson(sec);
        section.id = sectionIdMap.get(sec.id as string);
        section.bookId = newBook.id;
        section.parentId = sec.parentId
          ? sectionIdMap.get(sec.parentId as string) || null
          : null;
        // Root section must always be a container
        if (!section.parentId) {
          section.type = "container";
        }
        section.mediaId = sec.mediaId
          ? mediaIdMap.get(sec.mediaId as string) || null
          : null;
        await SectionsDataAdd(section);
      }

      for (const attr of attributesData as Record<string, unknown>[]) {
        const newAttr = BookAttribute.fromJson(attr);
        newAttr.id = attributeIdMap.get(attr.id as string);
        newAttr.bookId = newBook.id;
        await BookAttributesDataAdd(newAttr);
      }

      for (const prop of propertiesData as Record<string, unknown>[]) {
        const newProp = Property.fromJson(prop);
        newProp.id = propertyIdMap.get(prop.id as string);
        newProp.bookId = newBook.id;
        await PropertiesDataAdd(newProp);
      }

      for (const sp of sectionPropertiesData as Record<string, unknown>[]) {
        const newSectionId = sectionIdMap.get(sp.sectionId as string);
        const newPropertyId = propertyIdMap.get(sp.propertyId as string);
        if (!newSectionId || !newPropertyId) continue;
        await PropertiesDataSetSectionValue(
          newSectionId,
          newPropertyId,
          sp.value as string,
        );
      }

      for (const mediaMeta of mediaMetadataData as Record<string, unknown>[]) {
        const newMediaId = mediaIdMap.get(mediaMeta.id as string);
        const newMedia: Media = {
          id: newMediaId,
          bookId: newBook.id,
          slug: slugFor(mediaMeta),
          filename: GenerateMediaFilename(newMediaId, mediaMeta.mimeType as string),
          originalFilename: SanitizeOriginalFilename(
            (mediaMeta.originalFilename as string) ||
              (mediaMeta.filename as string),
          ),
          mimeType: mediaMeta.mimeType as string,
          size: mediaMeta.size as number,
          dateCreated:
            (mediaMeta.dateCreated as string) || new Date().toISOString(),
        };
        await MediaDataAdd(newMedia);
      }

      // The importer gets write access inside the same transaction so a
      // failure never leaves an inaccessible partial book.
      await BooksDataSetAccess(newBook.id, ownerId, "write");
    });

    return newBook;
  } catch (err) {
    // The transaction rolled back: remove any staged media files so a failed
    // import leaves no rows, no files and no temp dir.
    if (stagedBookId) {
      await fs
        .remove(SafeJoin(config.DATA_DIR, "media", stagedBookId))
        .catch(() => undefined);
    }
    throw err;
  } finally {
    await fs.remove(tmpDir).catch(() => undefined);
  }
}
