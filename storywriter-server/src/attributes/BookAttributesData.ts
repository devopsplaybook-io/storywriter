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
  // Delete the attribute
  await DbUtilsExecSQL(SQL_QUERIES.DELETE[DbUtilsGetType()], [id]);
}

export async function BookAttributesDataDeleteByBook(
  bookId: string,
): Promise<void> {
  // Delete all attributes for this book
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BY_BOOK[DbUtilsGetType()], [bookId]);
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
      'INSERT INTO book_attributes ("id", "bookId", "title", "content", "dateCreated", "dateUpdated") VALUES ($1, $2, $3, $4, $5, $6)',
    sqlite:
      "INSERT INTO book_attributes (id, bookId, title, content, dateCreated, dateUpdated) VALUES (?, ?, ?, ?, ?, ?)",
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
};
