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
import { BooksDataGet, BooksDataAdd } from "./BooksData";
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

const EXPORT_VERSION = "2.0";

// ==================== EXPORT ====================

export async function BookExportRun(
  bookId: string,
  config: Config,
): Promise<TarArchive> {
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
    mediaMetadata: mediaItems,
  };

  // Create archive — TarArchive extends stream.Transform (readable + writable)
  const archive = new TarArchive({
    gzip: true,
    gzipOptions: { level: 6 },
  });

  archive.on("error", (err) => {
    throw err;
  });

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
    const mediaDir = path.join(config.DATA_DIR, "media", bookId, media.id);
    const filePath = path.join(mediaDir, media.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `media/${media.id}/${media.filename}` });
    }
  }

  // finalize() returns Promise<void> — kick it off but return the stream immediately
  archive.finalize();
  return archive;
}

// ==================== IMPORT ====================

export async function BookImportRun(
  archiveBuffer: Buffer,
  config: Config,
): Promise<Book> {
  const tmpDir = path.join(config.TMP_DIR, `import-${uuidv4()}`);

  try {
    // Extract archive to temp directory
    await fs.ensureDir(tmpDir);
    const archivePath = path.join(tmpDir, "archive.tar.gz");
    await fs.writeFile(archivePath, archiveBuffer);
    await tar.extract({
      file: archivePath,
      cwd: tmpDir,
      gzip: true,
    });
    await fs.remove(archivePath);

    // Read manifest
    const manifestPath = path.join(tmpDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("Invalid archive: manifest.json not found");
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    if (manifest.version !== EXPORT_VERSION) {
      throw new Error(
        `Unsupported export version: ${manifest.version}. Expected ${EXPORT_VERSION}`,
      );
    }

    // Read all JSON files
    const bookData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "book.json"), "utf-8"),
    );
    const sectionsData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "sections.json"), "utf-8"),
    );
    const attributesData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "attributes.json"), "utf-8"),
    );
    const propertiesData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "properties.json"), "utf-8"),
    );
    const sectionPropertiesData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "section-properties.json"), "utf-8"),
    );
    const mediaMetadataData = JSON.parse(
      await fs.readFile(path.join(tmpDir, "media-metadata.json"), "utf-8"),
    );

    // Create new book
    const newBook = new Book();
    newBook.name = bookData.name;
    newBook.description = bookData.description || "";
    newBook.dateCreated = bookData.dateCreated || new Date().toISOString();
    await BooksDataAdd(newBook);

    // Create ID mappings
    const sectionIdMap = new Map<string, string>(); // old → new
    const propertyIdMap = new Map<string, string>();
    const mediaIdMap = new Map<string, string>();
    const attributeIdMap = new Map<string, string>();

    // Map media IDs first (needed for sections that reference media)
    for (const mediaMeta of mediaMetadataData) {
      mediaIdMap.set(mediaMeta.id, uuidv4());
    }

    // Map section IDs
    for (const sec of sectionsData) {
      sectionIdMap.set(sec.id, uuidv4());
    }

    // Map property IDs
    for (const prop of propertiesData) {
      propertyIdMap.set(prop.id, uuidv4());
    }

    // Map attribute IDs
    for (const attr of attributesData) {
      attributeIdMap.set(attr.id, uuidv4());
    }

    // Import sections
    for (const sec of sectionsData) {
      const section = new Section();
      section.id = sectionIdMap.get(sec.id);
      section.bookId = newBook.id;
      section.parentId = sec.parentId
        ? sectionIdMap.get(sec.parentId) || null
        : null;
      section.type = sec.type || "text";
      section.title = sec.title || "";
      section.content = sec.content || "";
      section.analysis = sec.analysis || "";
      section.mediaId = sec.mediaId
        ? mediaIdMap.get(sec.mediaId) || null
        : null;
      section.caption = sec.caption || "";
      section.orderIndex = sec.orderIndex || 0;
      section.dateCreated = sec.dateCreated || new Date().toISOString();
      section.dateUpdated = sec.dateUpdated || new Date().toISOString();
      await SectionsDataAdd(section);
    }

    // Import attributes
    for (const attr of attributesData) {
      const newAttr = BookAttribute.fromJson(attr);
      newAttr.id = attributeIdMap.get(attr.id);
      newAttr.bookId = newBook.id;
      await BookAttributesDataAdd(newAttr);
    }

    // Import properties
    for (const prop of propertiesData) {
      const newProp = Property.fromJson(prop);
      newProp.id = propertyIdMap.get(prop.id);
      newProp.bookId = newBook.id;
      await PropertiesDataAdd(newProp);
    }

    // Import section property values
    for (const sp of sectionPropertiesData) {
      const newSectionId = sectionIdMap.get(sp.sectionId);
      const newPropertyId = propertyIdMap.get(sp.propertyId);
      if (!newSectionId || !newPropertyId) continue;
      await PropertiesDataSetSectionValue(
        newSectionId,
        newPropertyId,
        sp.value,
      );
    }

    // Import media
    for (const mediaMeta of mediaMetadataData) {
      const newMediaId = mediaIdMap.get(mediaMeta.id);
      const newMedia: Media = {
        id: newMediaId,
        bookId: newBook.id,
        slug: mediaMeta.slug,
        filename: mediaMeta.filename,
        mimeType: mediaMeta.mimeType,
        size: mediaMeta.size,
        dateCreated: mediaMeta.dateCreated,
      };
      await MediaDataAdd(newMedia);

      // Copy media file from temp dir to DATA_DIR
      const srcPath = path.join(
        tmpDir,
        "media",
        mediaMeta.id,
        mediaMeta.filename,
      );
      if (fs.existsSync(srcPath)) {
        const destDir = path.join(
          config.DATA_DIR,
          "media",
          newBook.id,
          newMediaId,
        );
        await fs.ensureDir(destDir);
        await fs.copy(srcPath, path.join(destDir, mediaMeta.filename));
      }
    }

    return newBook;
  } finally {
    // Clean up temp directory
    await fs.remove(tmpDir);
  }
}
