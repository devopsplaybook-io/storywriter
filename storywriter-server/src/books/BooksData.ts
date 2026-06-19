import { Book } from "../model/Book";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import { BookAttributesDataDeleteByBook } from "../attributes/BookAttributesData";

// ==================== Book CRUD ====================

export async function BooksDataGet(id: string): Promise<Book> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_BOOK_BY_ID[DbUtilsGetType()],
    [id],
  );
  if (rows.length === 0) {
    return null;
  }
  return Book.fromJson(rows[0]);
}

export async function BooksDataList(): Promise<Book[]> {
  const rows = await DbUtilsQuerySQL(SQL_QUERIES.LIST_BOOKS[DbUtilsGetType()]);
  return rows.map((raw) => Book.fromJson(raw));
}

export async function BooksDataListForUser(userId: string): Promise<Book[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_BOOKS_FOR_USER[DbUtilsGetType()],
    [userId],
  );
  return rows.map((raw) => Book.fromJson(raw));
}

export async function BooksDataAdd(book: Book): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_BOOK[DbUtilsGetType()], [
    book.id,
    book.name,
    book.description,
    book.dateCreated,
  ]);
}

export async function BooksDataUpdate(book: Book): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE_BOOK[DbUtilsGetType()], [
    book.name,
    book.description,
    book.id,
  ]);
}

export async function BooksDataDelete(id: string): Promise<void> {
  await BookAttributesDataDeleteByBook(id);
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_SECTIONS_FOR_BOOK[DbUtilsGetType()], [
    id,
  ]);
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTIES_FOR_BOOK[DbUtilsGetType()],
    [id],
  );
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_PROPERTIES[DbUtilsGetType()], [
    id,
  ]);
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_ACCESS[DbUtilsGetType()], [id]);
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK[DbUtilsGetType()], [id]);
}

// ==================== Book Access ====================

export interface BookAccess {
  bookId: string;
  userId: string;
  permission: "read" | "write";
}

export async function BooksDataGetAccess(
  bookId: string,
): Promise<BookAccess[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_BOOK_ACCESS[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((r) => ({
    bookId: r.bookId,
    userId: r.userId,
    permission: r.permission,
  }));
}

export async function BooksDataGetUserAccess(
  bookId: string,
  userId: string,
): Promise<string | null> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_USER_BOOK_ACCESS[DbUtilsGetType()],
    [bookId, userId],
  );
  if (rows.length === 0) {
    return null;
  }
  return rows[0].permission;
}

export async function BooksDataSetAccess(
  bookId: string,
  userId: string,
  permission: "read" | "write",
): Promise<void> {
  if (DbUtilsGetType() === "sqlite") {
    await DbUtilsExecSQL(SQL_QUERIES.UPSERT_BOOK_ACCESS[DbUtilsGetType()], [
      bookId,
      userId,
      permission,
      permission,
    ]);
  } else {
    await DbUtilsExecSQL(SQL_QUERIES.UPSERT_BOOK_ACCESS[DbUtilsGetType()], [
      bookId,
      userId,
      permission,
    ]);
  }
}

export async function BooksDataRemoveAccess(
  bookId: string,
  userId: string,
): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_ACCESS_ENTRY[DbUtilsGetType()], [
    bookId,
    userId,
  ]);
}

const SQL_QUERIES = {
  GET_BOOK_BY_ID: {
    postgres: 'SELECT * FROM books WHERE "id" = $1',
    sqlite: "SELECT * FROM books WHERE id = ?",
  },
  LIST_BOOKS: {
    postgres: "SELECT * FROM books ORDER BY name",
    sqlite: "SELECT * FROM books ORDER BY name",
  },
  LIST_BOOKS_FOR_USER: {
    postgres:
      'SELECT b.* FROM books b LEFT JOIN book_access ba ON b."id" = ba."bookId" WHERE ba."userId" = $1 OR NOT EXISTS (SELECT 1 FROM book_access WHERE "bookId" = b."id") ORDER BY b."name"',
    sqlite:
      "SELECT b.* FROM books b LEFT JOIN book_access ba ON b.id = ba.bookId WHERE ba.userId = ? OR NOT EXISTS (SELECT 1 FROM book_access WHERE bookId = b.id) ORDER BY b.name",
  },
  INSERT_BOOK: {
    postgres:
      'INSERT INTO books ("id", "name", "description", "dateCreated") VALUES ($1, $2, $3, $4)',
    sqlite:
      "INSERT INTO books (id, name, description, dateCreated) VALUES (?, ?, ?, ?)",
  },
  UPDATE_BOOK: {
    postgres:
      'UPDATE books SET "name" = $1, "description" = $2 WHERE "id" = $3',
    sqlite: "UPDATE books SET name = ?, description = ? WHERE id = ?",
  },
  DELETE_BOOK: {
    postgres: 'DELETE FROM books WHERE "id" = $1',
    sqlite: "DELETE FROM books WHERE id = ?",
  },
  GET_BOOK_ACCESS: {
    postgres: 'SELECT * FROM book_access WHERE "bookId" = $1',
    sqlite: "SELECT * FROM book_access WHERE bookId = ?",
  },
  GET_USER_BOOK_ACCESS: {
    postgres: 'SELECT * FROM book_access WHERE "bookId" = $1 AND "userId" = $2',
    sqlite: "SELECT * FROM book_access WHERE bookId = ? AND userId = ?",
  },
  UPSERT_BOOK_ACCESS: {
    postgres:
      'INSERT INTO book_access ("bookId", "userId", "permission") VALUES ($1, $2, $3) ON CONFLICT ("bookId", "userId") DO UPDATE SET "permission" = $3',
    sqlite:
      "INSERT INTO book_access (bookId, userId, permission) VALUES (?, ?, ?) ON CONFLICT (bookId, userId) DO UPDATE SET permission = ?",
  },
  DELETE_BOOK_ACCESS: {
    postgres: 'DELETE FROM book_access WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_access WHERE bookId = ?",
  },
  DELETE_BOOK_ACCESS_ENTRY: {
    postgres: 'DELETE FROM book_access WHERE "bookId" = $1 AND "userId" = $2',
    sqlite: "DELETE FROM book_access WHERE bookId = ? AND userId = ?",
  },
  DELETE_BOOK_PROPERTIES: {
    postgres: 'DELETE FROM book_properties WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_properties WHERE bookId = ?",
  },
  DELETE_SECTIONS_FOR_BOOK: {
    postgres: 'DELETE FROM sections WHERE "bookId" = $1',
    sqlite: "DELETE FROM sections WHERE bookId = ?",
  },
  DELETE_SECTION_PROPERTIES_FOR_BOOK: {
    postgres:
      'DELETE FROM section_properties WHERE "sectionId" IN (SELECT "id" FROM sections WHERE "bookId" = $1)',
    sqlite:
      "DELETE FROM section_properties WHERE sectionId IN (SELECT id FROM sections WHERE bookId = ?)",
  },
};
