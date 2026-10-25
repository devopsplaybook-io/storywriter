import * as fs from "fs-extra";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Config } from "../Config";
import { BookVersion } from "../model/BookVersion";
import { Section } from "../model/Section";
import { BookAttribute } from "../model/BookAttribute";
import { Property } from "../model/Property";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import { DbUtilsTransaction } from "../utils/DbTransaction";
import { SafeJoin, IsSafePathSegment } from "../utils/SafePath";
import { LinkOrCopyFile, RemoveMediaDirsNotIn } from "../books/BookFiles";
import { BookAnalysisDeleteCache } from "../analysis/BookAnalysis";
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
  PropertiesDataGetAllSectionValuesForBook,
  PropertiesDataAdd,
  PropertiesDataSetSectionValue,
} from "../properties/PropertiesData";
import { MediaDataList, MediaDataAdd, Media } from "../media/MediaData";

export interface BookSnapshot {
  sections: Record<string, unknown>[];
  attributes: Record<string, unknown>[];
  mediaMeta: Record<string, unknown>[];
  properties?: Record<string, unknown>[];
  sectionProperties?: {
    sectionId: string;
    propertyId: string;
    value: string;
  }[];
}

/**
 * List the versions of a book with metadata only (no snapshot column, which
 * holds the whole book): listing 50 versions must not download the book 50
 * times. Snapshot sizes come back as the `size` field.
 */
export async function VersionsDataListByBook(
  bookId: string,
): Promise<BookVersion[]> {
  try {
    const rows = await DbUtilsQuerySQL(
      SQL_QUERIES.LIST_BY_BOOK_META[DbUtilsGetType()],
      [bookId],
    );
    return rows.map((raw) => BookVersion.fromJson(raw));
  } catch {
    return [];
  }
}

/**
 * Load one version with its full snapshot (snapshot endpoint, restore).
 */
export async function VersionsDataGet(id: string): Promise<BookVersion> {
  try {
    const rows = await DbUtilsQuerySQL(
      SQL_QUERIES.GET_BY_ID[DbUtilsGetType()],
      [id],
    );
    if (rows.length === 0) {
      return null;
    }
    return BookVersion.fromJson(rows[0]);
  } catch {
    return null;
  }
}

/**
 * Load one version's metadata (no snapshot).
 */
export async function VersionsDataGetMeta(
  id: string,
): Promise<BookVersion> {
  try {
    const rows = await DbUtilsQuerySQL(
      SQL_QUERIES.GET_BY_ID_META[DbUtilsGetType()],
      [id],
    );
    if (rows.length === 0) {
      return null;
    }
    return BookVersion.fromJson(rows[0]);
  } catch {
    return null;
  }
}

function VersionMediaDir(config: Config, bookId: string, versionId: string) {
  return SafeJoin(config.DATA_DIR, "media", bookId, "versions", versionId);
}

/**
 * Hard-link (copy as fallback) the current media files into the version
 * directory, then prune versions beyond config.VERSIONS_MAX_PER_BOOK.
 * Filesystem failures during pruning are logged, never fail the committed
 * version creation.
 */
export async function VersionsDataCreate(
  bookId: string,
  note: string,
  config: Config,
): Promise<BookVersion> {
  // Get current max version number
  const maxRow = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_MAX_VERSION[DbUtilsGetType()],
    [bookId],
  );
  const maxVersion = maxRow[0]?.maxVersion || 0;

  const version = new BookVersion();
  version.bookId = bookId;
  version.versionNumber = maxVersion + 1;
  version.note = note;

  // Build snapshot from current data
  const sections = await SectionsDataListByBook(bookId);
  const attributes = await BookAttributesDataListByBook(bookId);
  const mediaItems = await MediaDataList(bookId);
  const properties = await PropertiesDataListByBook(bookId);
  const sectionProperties = await PropertiesDataGetAllSectionValuesForBook(bookId);

  const snapshot: BookSnapshot = {
    sections: sections.map((s) => s.toJson()),
    attributes: attributes.map((a) => a.toJson()),
    mediaMeta: mediaItems.map((m) => ({ ...m })),
    properties: properties.map((p) => p.toJson()),
    sectionProperties,
  };
  version.snapshot = JSON.stringify(snapshot);

  // Hard-link media files into the version directory instead of duplicating
  // bytes; a copy is used when hard links are not possible (e.g. cross-device).
  if (mediaItems.length > 0) {
    const versionMediaDir = VersionMediaDir(config, bookId, version.id);
    await fs.mkdir(versionMediaDir, { recursive: true });
    for (const media of mediaItems) {
      if (!IsSafePathSegment(media.id) || !IsSafePathSegment(media.filename)) {
        continue;
      }
      const srcFile = SafeJoin(
        config.DATA_DIR,
        "media",
        bookId,
        media.id,
        media.filename,
      );
      const destDir = SafeJoin(versionMediaDir, media.id);
      try {
        await fs.access(srcFile);
        await fs.mkdir(destDir, { recursive: true });
        await LinkOrCopyFile(srcFile, path.join(destDir, media.filename));
      } catch {
        // File might not exist on disk, skip
      }
    }
  }

  await DbUtilsExecSQL(SQL_QUERIES.INSERT[DbUtilsGetType()], [
    version.id,
    version.bookId,
    version.versionNumber,
    version.note,
    version.snapshot,
    version.dateCreated,
  ]);

  // Retention: keep only the newest VERSIONS_MAX_PER_BOOK versions.
  try {
    await PruneOldVersions(bookId, config);
  } catch (err) {
    console.error(
      `[VersionsData] Retention pruning failed for book ${bookId}: ${(err as Error).message}`,
    );
  }

  return version;
}

async function PruneOldVersions(
  bookId: string,
  config: Config,
): Promise<void> {
  // Metadata-only rows are enough: pruning needs ids and version numbers.
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_BY_BOOK_META[DbUtilsGetType()],
    [bookId],
  );
  const versions = rows.map((raw) => BookVersion.fromJson(raw));
  const excess = versions.slice(config.VERSIONS_MAX_PER_BOOK);
  for (const version of excess) {
    await DbUtilsExecSQL(SQL_QUERIES.DELETE_BY_ID[DbUtilsGetType()], [
      version.id,
    ]);
    if (IsSafePathSegment(version.id)) {
      try {
        await fs.remove(VersionMediaDir(config, bookId, version.id));
      } catch (err) {
        console.error(
          `[VersionsData] Failed to remove version media dir ${version.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}

export async function VersionsDataRestore(
  versionId: string,
  config: Config,
): Promise<void> {
  const version = await VersionsDataGet(versionId);
  if (!version) {
    throw new Error("Version not found");
  }

  const snapshot: BookSnapshot = JSON.parse(version.snapshot);
  const mediaMeta = (snapshot.mediaMeta || []) as unknown as Media[];

  // Stage the snapshot media files before touching the database: the restore
  // replaces the live media directories only after the DB commit.
  const stagingDir = SafeJoin(
    config.DATA_DIR,
    "media",
    version.bookId,
    `restore-${uuidv4()}`,
  );
  const stagedFiles: { media: Media; stagedPath: string }[] = [];
  await fs.mkdir(stagingDir, { recursive: true });
  try {
    for (const media of mediaMeta) {
      if (
        !IsSafePathSegment(media.id) ||
        !IsSafePathSegment(media.filename)
      ) {
        console.error(
          `[VersionsData] Skipping unsafe media entry ${JSON.stringify(media.id)} in version ${versionId}`,
        );
        continue;
      }
      const versionFile = SafeJoin(
        VersionMediaDir(config, version.bookId, version.id),
        media.id,
        media.filename,
      );
      if (!(await fs.pathExists(versionFile))) {
        continue;
      }
      const stagedPath = path.join(stagingDir, media.id);
      await fs.mkdir(stagedPath, { recursive: true });
      await LinkOrCopyFile(versionFile, path.join(stagedPath, media.filename));
      stagedFiles.push({ media, stagedPath });
    }

    // All-or-nothing restore. DB work only — filesystem placement happens
    // after the commit.
    await DbUtilsTransaction(async () => {
      // Delete current sections (and their property values) for the book
      await DbUtilsExecSQL(
        SQL_QUERIES.DELETE_SECTION_PROPERTIES_FOR_BOOK[DbUtilsGetType()],
        [version.bookId],
      );
      await DbUtilsExecSQL(
        SQL_QUERIES.DELETE_SECTIONS_FOR_BOOK[DbUtilsGetType()],
        [version.bookId],
      );

      // Delete current attributes for the book
      await DbUtilsExecSQL(
        SQL_QUERIES.DELETE_ATTRIBUTES_FOR_BOOK[DbUtilsGetType()],
        [version.bookId],
      );

      // Delete current media metadata
      await DbUtilsExecSQL(SQL_QUERIES.DELETE_MEDIA_FOR_BOOK[DbUtilsGetType()], [
        version.bookId,
      ]);

      // Re-create sections from snapshot (preserving content and AI notes)
      for (const secData of snapshot.sections || []) {
        const section = Section.fromJson(secData);
        await SectionsDataAdd(section);
      }

      // Re-create attributes from snapshot
      for (const attrData of snapshot.attributes || []) {
        const attr = BookAttribute.fromJson(attrData);
        await BookAttributesDataAdd(attr);
      }

      // Re-create media metadata (files are placed after the commit)
      for (const media of mediaMeta) {
        await MediaDataAdd(media);
      }

      // New snapshots restore property definitions and values authoritatively;
      // legacy snapshots (without `properties`) keep the current ones.
      if (Array.isArray(snapshot.properties)) {
        await DbUtilsExecSQL(
          SQL_QUERIES.DELETE_BOOK_PROPERTIES[DbUtilsGetType()],
          [version.bookId],
        );
        for (const propData of snapshot.properties) {
          const property = Property.fromJson(propData);
          await PropertiesDataAdd(property);
        }
        for (const sp of snapshot.sectionProperties || []) {
          await PropertiesDataSetSectionValue(
            sp.sectionId,
            sp.propertyId,
            sp.value,
          );
        }
      }
    });
  } catch (err) {
    await fs.remove(stagingDir).catch(() => undefined);
    throw err;
  }

  // Restore committed: place the staged media files and clean up.
  try {
    for (const { media, stagedPath } of stagedFiles) {
      const destDir = SafeJoin(
        config.DATA_DIR,
        "media",
        version.bookId,
        media.id,
      );
      await fs.mkdir(destDir, { recursive: true });
      await LinkOrCopyFile(
        path.join(stagedPath, media.filename),
        path.join(destDir, media.filename),
      );
    }
    await RemoveMediaDirsNotIn(
      config,
      version.bookId,
      mediaMeta.map((m) => m.id),
    );
    await BookAnalysisDeleteCache(version.bookId);
  } catch (err) {
    console.error(
      `[VersionsData] Post-restore media placement failed for version ${versionId}: ${(err as Error).message}`,
    );
  } finally {
    await fs.remove(stagingDir).catch(() => undefined);
  }
}

const SQL_QUERIES = {
  LIST_BY_BOOK_META: {
    postgres:
      'SELECT "id", "bookId", "versionNumber", "note", "dateCreated", LENGTH("snapshot") AS "size" FROM book_versions WHERE "bookId" = $1 ORDER BY "versionNumber" DESC',
    sqlite:
      'SELECT id, bookId, versionNumber, note, dateCreated, LENGTH("snapshot") AS size FROM book_versions WHERE bookId = ? ORDER BY versionNumber DESC',
  },
  GET_BY_ID_META: {
    postgres:
      'SELECT "id", "bookId", "versionNumber", "note", "dateCreated", LENGTH("snapshot") AS "size" FROM book_versions WHERE "id" = $1',
    sqlite:
      'SELECT id, bookId, versionNumber, note, dateCreated, LENGTH("snapshot") AS size FROM book_versions WHERE id = ?',
  },
  LIST_BY_BOOK: {
    postgres:
      'SELECT * FROM book_versions WHERE "bookId" = $1 ORDER BY "versionNumber" DESC',
    sqlite:
      "SELECT * FROM book_versions WHERE bookId = ? ORDER BY versionNumber DESC",
  },
  GET_BY_ID: {
    postgres: 'SELECT * FROM book_versions WHERE "id" = $1',
    sqlite: "SELECT * FROM book_versions WHERE id = ?",
  },
  GET_MAX_VERSION: {
    postgres:
      'SELECT MAX("versionNumber") AS "maxVersion" FROM book_versions WHERE "bookId" = $1',
    sqlite:
      "SELECT MAX(versionNumber) AS maxVersion FROM book_versions WHERE bookId = ?",
  },
  INSERT: {
    postgres:
      'INSERT INTO book_versions ("id", "bookId", "versionNumber", "note", "snapshot", "dateCreated") VALUES ($1, $2, $3, $4, $5, $6)',
    sqlite:
      "INSERT INTO book_versions (id, bookId, versionNumber, note, snapshot, dateCreated) VALUES (?, ?, ?, ?, ?, ?)",
  },
  DELETE_BY_ID: {
    postgres: 'DELETE FROM book_versions WHERE "id" = $1',
    sqlite: "DELETE FROM book_versions WHERE id = ?",
  },
  DELETE_SECTION_PROPERTIES_FOR_BOOK: {
    postgres:
      'DELETE FROM section_properties WHERE "sectionId" IN (SELECT "id" FROM sections WHERE "bookId" = $1)',
    sqlite:
      "DELETE FROM section_properties WHERE sectionId IN (SELECT id FROM sections WHERE bookId = ?)",
  },
  DELETE_SECTIONS_FOR_BOOK: {
    postgres: 'DELETE FROM sections WHERE "bookId" = $1',
    sqlite: "DELETE FROM sections WHERE bookId = ?",
  },
  DELETE_ATTRIBUTES_FOR_BOOK: {
    postgres: 'DELETE FROM book_attributes WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_attributes WHERE bookId = ?",
  },
  DELETE_MEDIA_FOR_BOOK: {
    postgres: 'DELETE FROM media WHERE "bookId" = $1',
    sqlite: "DELETE FROM media WHERE bookId = ?",
  },
  DELETE_BOOK_PROPERTIES: {
    postgres: 'DELETE FROM book_properties WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_properties WHERE bookId = ?",
  },
};
