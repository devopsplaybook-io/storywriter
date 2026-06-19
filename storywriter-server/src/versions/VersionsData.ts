import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { BookVersion } from "../model/BookVersion";
import { Section } from "../model/Section";
import { BookAttribute } from "../model/BookAttribute";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import {
  SectionsDataListByBook,
  SectionsDataAdd,
} from "../sections/SectionsData";
import {
  BookAttributesDataListByBook,
  BookAttributesDataAdd,
} from "../attributes/BookAttributesData";
import { MediaDataList, MediaDataAdd, Media } from "../media/MediaData";

export interface BookSnapshot {
  sections: Record<string, unknown>[];
  attributes: Record<string, unknown>[];
  mediaMeta: Record<string, unknown>[];
}

export async function VersionsDataListByBook(
  bookId: string,
): Promise<BookVersion[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_BY_BOOK[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((raw) => BookVersion.fromJson(raw));
}

export async function VersionsDataGet(id: string): Promise<BookVersion> {
  const rows = await DbUtilsQuerySQL(SQL_QUERIES.GET_BY_ID[DbUtilsGetType()], [
    id,
  ]);
  if (rows.length === 0) {
    return null;
  }
  return BookVersion.fromJson(rows[0]);
}

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

  const snapshot: BookSnapshot = {
    sections: sections.map((s) => s.toJson()),
    attributes: attributes.map((a) => a.toJson()),
    mediaMeta: mediaItems.map((m) => ({ ...m })),
  };
  version.snapshot = JSON.stringify(snapshot);

  // Copy media files to version directory
  if (mediaItems.length > 0) {
    const versionMediaDir = path.join(
      config.DATA_DIR,
      "media",
      bookId,
      "versions",
      version.id,
    );
    await fs.mkdir(versionMediaDir, { recursive: true });
    for (const media of mediaItems) {
      const srcDir = path.join(config.DATA_DIR, "media", bookId, media.id);
      const srcFile = path.join(srcDir, media.filename);
      try {
        await fs.access(srcFile);
        const destDir = path.join(versionMediaDir, media.id);
        await fs.mkdir(destDir, { recursive: true });
        await fs.copyFile(srcFile, path.join(destDir, media.filename));
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

  return version;
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

  // Delete current sections for the book
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTIES_FOR_BOOK[DbUtilsGetType()],
    [version.bookId],
  );
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_SECTIONS_FOR_BOOK[DbUtilsGetType()], [
    version.bookId,
  ]);

  // Delete current attributes for the book
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_ATTRIBUTES_FOR_BOOK[DbUtilsGetType()],
    [version.bookId],
  );

  // Delete current media metadata
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_MEDIA_FOR_BOOK[DbUtilsGetType()], [
    version.bookId,
  ]);

  // Re-create sections from snapshot
  for (const secData of snapshot.sections) {
    const section = Section.fromJson(secData);
    await SectionsDataAdd(section);
  }

  // Re-create attributes from snapshot
  for (const attrData of snapshot.attributes) {
    const attr = BookAttribute.fromJson(attrData);
    await BookAttributesDataAdd(attr);
  }

  // Re-create media metadata and copy files back
  for (const mediaData of snapshot.mediaMeta) {
    const media: Media = {
      id: mediaData.id as string,
      bookId: mediaData.bookId as string,
      slug: mediaData.slug as string,
      filename: mediaData.filename as string,
      mimeType: mediaData.mimeType as string,
      size: mediaData.size as number,
      dateCreated: mediaData.dateCreated as string,
    };
    await MediaDataAdd(media);

    // Copy media file from version directory back
    const versionMediaDir = path.join(
      config.DATA_DIR,
      "media",
      version.bookId,
      "versions",
      version.id,
      media.id,
      media.filename,
    );
    const destDir = path.join(
      config.DATA_DIR,
      "media",
      version.bookId,
      media.id,
    );
    try {
      await fs.access(versionMediaDir);
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(versionMediaDir, path.join(destDir, media.filename));
    } catch {
      // File might not exist, skip
    }
  }

  // Clear section_properties (they reference old sections)
  // They'll be re-created as sections are edited
}

const SQL_QUERIES = {
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
};
