import { v4 as uuidv4 } from "uuid";
import { BookAttribute } from "../model/BookAttribute";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";

// ==================== CRUD ====================

export async function BookAttributesDataGet(
  id: string,
): Promise<BookAttribute> {
  const rows = await DbUtilsQuerySQL(SQL_QUERIES.GET_BY_ID[DbUtilsGetType()], [
    id,
  ]);
  if (rows.length === 0) {
    return null;
  }
  return BookAttribute.fromJson(rows[0]);
}

export async function BookAttributesDataListByBook(
  bookId: string,
): Promise<BookAttribute[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_BY_BOOK[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((raw) => BookAttribute.fromJson(raw));
}

export async function BookAttributesDataAdd(
  attr: BookAttribute,
): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT[DbUtilsGetType()], [
    attr.id,
    attr.bookId,
    attr.title,
    attr.content,
    attr.version,
    attr.dateCreated,
    attr.dateUpdated,
  ]);
}

export async function BookAttributesDataUpdate(
  attr: BookAttribute,
): Promise<void> {
  attr.dateUpdated = new Date().toISOString();
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE[DbUtilsGetType()], [
    attr.title,
    attr.content,
    attr.dateUpdated,
    attr.id,
  ]);
}

export async function BookAttributesDataDelete(id: string): Promise<void> {
  // Delete versions first
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_VERSIONS[DbUtilsGetType()], [id]);
  // Delete the attribute
  await DbUtilsExecSQL(SQL_QUERIES.DELETE[DbUtilsGetType()], [id]);
}

export async function BookAttributesDataDeleteByBook(
  bookId: string,
): Promise<void> {
  // Delete all versions for attributes of this book
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_VERSIONS_BY_BOOK[DbUtilsGetType()], [
    bookId,
  ]);
  // Delete all attributes for this book
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BY_BOOK[DbUtilsGetType()], [bookId]);
}

// ==================== Versioning ====================

export async function BookAttributesDataCreateVersion(
  attributeId: string,
): Promise<void> {
  const attr = await BookAttributesDataGet(attributeId);
  if (!attr) {
    return;
  }
  const versionId = uuidv4();
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_VERSION[DbUtilsGetType()], [
    versionId,
    attr.id,
    attr.version,
    attr.title,
    attr.content,
    new Date().toISOString(),
  ]);
  // Bump version number
  attr.version += 1;
  await DbUtilsExecSQL(SQL_QUERIES.BUMP_VERSION[DbUtilsGetType()], [
    attr.version,
    new Date().toISOString(),
    attr.id,
  ]);
}

export async function BookAttributesDataListVersions(
  attributeId: string,
): Promise<unknown[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_VERSIONS[DbUtilsGetType()],
    [attributeId],
  );
  return rows;
}

export async function BookAttributesDataGetVersion(
  attributeId: string,
  version: number,
): Promise<unknown> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_VERSION[DbUtilsGetType()],
    [attributeId, version],
  );
  return rows.length > 0 ? rows[0] : null;
}

const SQL_QUERIES = {
  GET_BY_ID: {
    postgres: 'SELECT * FROM book_attributes WHERE "id" = $1',
    sqlite: "SELECT * FROM book_attributes WHERE id = ?",
  },
  LIST_BY_BOOK: {
    postgres:
      'SELECT * FROM book_attributes WHERE "bookId" = $1 ORDER BY "title"',
    sqlite: "SELECT * FROM book_attributes WHERE bookId = ? ORDER BY title",
  },
  INSERT: {
    postgres:
      'INSERT INTO book_attributes ("id", "bookId", "title", "content", "version", "dateCreated", "dateUpdated") VALUES ($1, $2, $3, $4, $5, $6, $7)',
    sqlite:
      "INSERT INTO book_attributes (id, bookId, title, content, version, dateCreated, dateUpdated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  },
  UPDATE: {
    postgres:
      'UPDATE book_attributes SET "title" = $1, "content" = $2, "dateUpdated" = $3 WHERE "id" = $4',
    sqlite:
      "UPDATE book_attributes SET title = ?, content = ?, dateUpdated = ? WHERE id = ?",
  },
  DELETE: {
    postgres: 'DELETE FROM book_attributes WHERE "id" = $1',
    sqlite: "DELETE FROM book_attributes WHERE id = ?",
  },
  DELETE_BY_BOOK: {
    postgres: 'DELETE FROM book_attributes WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_attributes WHERE bookId = ?",
  },
  DELETE_VERSIONS: {
    postgres: 'DELETE FROM book_attribute_versions WHERE "attributeId" = $1',
    sqlite: "DELETE FROM book_attribute_versions WHERE attributeId = ?",
  },
  DELETE_VERSIONS_BY_BOOK: {
    postgres:
      'DELETE FROM book_attribute_versions WHERE "attributeId" IN (SELECT "id" FROM book_attributes WHERE "bookId" = $1)',
    sqlite:
      "DELETE FROM book_attribute_versions WHERE attributeId IN (SELECT id FROM book_attributes WHERE bookId = ?)",
  },
  INSERT_VERSION: {
    postgres:
      'INSERT INTO book_attribute_versions ("id", "attributeId", "version", "title", "content", "dateCreated") VALUES ($1, $2, $3, $4, $5, $6)',
    sqlite:
      "INSERT INTO book_attribute_versions (id, attributeId, version, title, content, dateCreated) VALUES (?, ?, ?, ?, ?, ?)",
  },
  LIST_VERSIONS: {
    postgres:
      'SELECT * FROM book_attribute_versions WHERE "attributeId" = $1 ORDER BY "version" DESC',
    sqlite:
      "SELECT * FROM book_attribute_versions WHERE attributeId = ? ORDER BY version DESC",
  },
  GET_VERSION: {
    postgres:
      'SELECT * FROM book_attribute_versions WHERE "attributeId" = $1 AND "version" = $2',
    sqlite:
      "SELECT * FROM book_attribute_versions WHERE attributeId = ? AND version = ?",
  },
  BUMP_VERSION: {
    postgres:
      'UPDATE book_attributes SET "version" = $1, "dateUpdated" = $2 WHERE "id" = $3',
    sqlite:
      "UPDATE book_attributes SET version = ?, dateUpdated = ? WHERE id = ?",
  },
};
