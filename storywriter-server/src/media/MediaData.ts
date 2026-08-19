import { v4 as uuidv4 } from "uuid";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";

export interface Media {
  id: string;
  bookId: string;
  slug: string;
  filename: string;
  mimeType: string;
  size: number;
  dateCreated: string;
}

export async function MediaDataList(bookId: string): Promise<Media[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_MEDIA_BY_BOOK[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((row: Record<string, unknown>) => MediaDataFromRow(row));
}

export async function MediaDataGet(id: string): Promise<Media | null> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_MEDIA_BY_ID[DbUtilsGetType()],
    [id],
  );
  if (rows.length === 0) {
    return null;
  }
  return MediaDataFromRow(rows[0] as Record<string, unknown>);
}

export async function MediaDataGetBySlug(
  bookId: string,
  slug: string,
): Promise<Media | null> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_MEDIA_BY_SLUG[DbUtilsGetType()],
    [bookId, slug],
  );
  if (rows.length === 0) {
    return null;
  }
  return MediaDataFromRow(rows[0] as Record<string, unknown>);
}

export async function MediaDataAdd(media: Media): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_MEDIA[DbUtilsGetType()], [
    media.id,
    media.bookId,
    media.slug,
    media.filename,
    media.mimeType,
    media.size,
    media.dateCreated,
  ]);
}

export async function MediaDataUpdate(
  id: string,
  updates: { slug?: string },
): Promise<void> {
  if (updates.slug !== undefined) {
    await DbUtilsExecSQL(SQL_QUERIES.UPDATE_MEDIA_SLUG[DbUtilsGetType()], [
      updates.slug,
      id,
    ]);
  }
}

export async function MediaDataDelete(id: string): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_MEDIA[DbUtilsGetType()], [id]);
}

export async function MediaDataDeleteByBook(bookId: string): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_MEDIA_BY_BOOK[DbUtilsGetType()], [
    bookId,
  ]);
}

function MediaDataFromRow(row: Record<string, unknown>): Media {
  return {
    id: row.id as string,
    bookId: row.bookId as string,
    slug: row.slug as string,
    filename: row.filename as string,
    mimeType: row.mimeType as string,
    size: row.size as number,
    dateCreated: row.dateCreated as string,
  };
}

export function MediaDataCreateNew(
  bookId: string,
  slug: string,
  filename: string,
  mimeType: string,
  size: number,
): Media {
  return {
    id: uuidv4(),
    bookId,
    slug,
    filename,
    mimeType,
    size,
    dateCreated: new Date().toISOString(),
  };
}

const SQL_QUERIES = {
  LIST_MEDIA_BY_BOOK: {
    postgres: 'SELECT * FROM media WHERE "bookId" = $1 ORDER BY "slug"',
    sqlite: "SELECT * FROM media WHERE bookId = ? ORDER BY slug",
  },
  GET_MEDIA_BY_ID: {
    postgres: 'SELECT * FROM media WHERE "id" = $1',
    sqlite: "SELECT * FROM media WHERE id = ?",
  },
  GET_MEDIA_BY_SLUG: {
    postgres: 'SELECT * FROM media WHERE "bookId" = $1 AND "slug" = $2',
    sqlite: "SELECT * FROM media WHERE bookId = ? AND slug = ?",
  },
  INSERT_MEDIA: {
    postgres:
      'INSERT INTO media ("id", "bookId", "slug", "filename", "mimeType", "size", "dateCreated") VALUES ($1, $2, $3, $4, $5, $6, $7)',
    sqlite:
      "INSERT INTO media (id, bookId, slug, filename, mimeType, size, dateCreated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  },
  UPDATE_MEDIA_SLUG: {
    postgres: 'UPDATE media SET "slug" = $1 WHERE "id" = $2',
    sqlite: "UPDATE media SET slug = ? WHERE id = ?",
  },
  DELETE_MEDIA: {
    postgres: 'DELETE FROM media WHERE "id" = $1',
    sqlite: "DELETE FROM media WHERE id = ?",
  },
  DELETE_MEDIA_BY_BOOK: {
    postgres: 'DELETE FROM media WHERE "bookId" = $1',
    sqlite: "DELETE FROM media WHERE bookId = ?",
  },
};
