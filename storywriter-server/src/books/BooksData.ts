import { Book } from "../model/Book";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import { BookAttributesDataDeleteByBook } from "../attributes/BookAttributesData";
import { MediaDataDeleteByBook } from "../media/MediaData";

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
    [userId, userId],
  );
  return rows.map((raw) => Book.fromJson(raw));
}

export async function BooksDataAdd(book: Book): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_BOOK[DbUtilsGetType()], [
    book.id,
    book.name,
    book.description,
    book.dateCreated,
    book.writingGoal,
    book.ownerId || null,
  ]);
}

export async function BooksDataUpdate(book: Book): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE_BOOK[DbUtilsGetType()], [
    book.name,
    book.description,
    book.writingGoal,
    book.id,
  ]);
}

export async function BooksDataDelete(id: string): Promise<void> {
  // Delete child records in dependency order to avoid FK constraint failures
  // 1. section_properties (FK → sections, book_properties) must go first
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTIES_FOR_BOOK[DbUtilsGetType()],
    [id],
  );
  // 2. section_versions (FK → sections) — pre-init-0002 migration, may not exist
  try {
    await DbUtilsExecSQL(
      SQL_QUERIES.DELETE_SECTION_VERSIONS_FOR_BOOK[DbUtilsGetType()],
      [id],
    );
  } catch {
    // table may not exist if init-0002 has been applied
  }
  // 3. sections (FK → books, self-referencing parentId)
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_SECTIONS_FOR_BOOK[DbUtilsGetType()], [
    id,
  ]);
  // 4. book_attribute_versions (FK → book_attributes) — pre-init-0002 migration, may not exist
  try {
    await DbUtilsExecSQL(
      SQL_QUERIES.DELETE_BOOK_ATTRIBUTE_VERSIONS_FOR_BOOK[DbUtilsGetType()],
      [id],
    );
  } catch {
    // table may not exist if init-0002 has been applied
  }
  // 5. book_attributes (FK → books)
  await BookAttributesDataDeleteByBook(id);
  // 6. book_properties (FK → books; must be after section_properties)
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_PROPERTIES[DbUtilsGetType()], [
    id,
  ]);
  // 7. media (FK → books)
  await MediaDataDeleteByBook(id);
  // 8. book_access (FK → books)
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_ACCESS[DbUtilsGetType()], [id]);
  // 9. book_versions (FK → books) — pre-init-0002 migration, may not exist
  try {
    await DbUtilsExecSQL(SQL_QUERIES.DELETE_BOOK_VERSIONS[DbUtilsGetType()], [
      id,
    ]);
  } catch {
    // table may not exist if the init-0002 migration hasn't been applied
  }
  // 10. Finally, the book itself
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

export async function BooksDataGetPermissionsForUser(
  userId: string,
): Promise<Record<string, "read" | "write">> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_PERMISSIONS_FOR_USER[DbUtilsGetType()],
    [userId],
  );
  const permissions: Record<string, "read" | "write"> = {};
  for (const row of rows) {
    permissions[row.bookId] = row.permission;
  }
  return permissions;
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
      'SELECT b.* FROM books b WHERE b."ownerId" = $1 OR EXISTS (SELECT 1 FROM book_access ba WHERE ba."bookId" = b."id" AND ba."userId" = $2) ORDER BY b."name"',
    sqlite:
      "SELECT b.* FROM books b WHERE b.ownerId = ? OR EXISTS (SELECT 1 FROM book_access ba WHERE ba.bookId = b.id AND ba.userId = ?) ORDER BY b.name",
  },
  INSERT_BOOK: {
    postgres:
      'INSERT INTO books ("id", "name", "description", "dateCreated", "writingGoal", "ownerId") VALUES ($1, $2, $3, $4, $5, $6)',
    sqlite:
      "INSERT INTO books (id, name, description, dateCreated, writingGoal, ownerId) VALUES (?, ?, ?, ?, ?, ?)",
  },
  UPDATE_BOOK: {
    postgres:
      'UPDATE books SET "name" = $1, "description" = $2, "writingGoal" = $3 WHERE "id" = $4',
    sqlite:
      "UPDATE books SET name = ?, description = ?, writingGoal = ? WHERE id = ?",
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
  LIST_PERMISSIONS_FOR_USER: {
    postgres: 'SELECT "bookId", "permission" FROM book_access WHERE "userId" = $1',
    sqlite: "SELECT bookId, permission FROM book_access WHERE userId = ?",
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
  DELETE_BOOK_VERSIONS: {
    postgres: 'DELETE FROM book_versions WHERE "bookId" = $1',
    sqlite: "DELETE FROM book_versions WHERE bookId = ?",
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
  DELETE_SECTION_VERSIONS_FOR_BOOK: {
    postgres:
      'DELETE FROM section_versions WHERE "sectionId" IN (SELECT "id" FROM sections WHERE "bookId" = $1)',
    sqlite:
      "DELETE FROM section_versions WHERE sectionId IN (SELECT id FROM sections WHERE bookId = ?)",
  },
  DELETE_BOOK_ATTRIBUTE_VERSIONS_FOR_BOOK: {
    postgres:
      'DELETE FROM book_attribute_versions WHERE "attributeId" IN (SELECT "id" FROM book_attributes WHERE "bookId" = $1)',
    sqlite:
      "DELETE FROM book_attribute_versions WHERE attributeId IN (SELECT id FROM book_attributes WHERE bookId = ?)",
  },
};
