import * as fs from "fs";
import * as path from "path";
import { TestServer, TestUser } from "../__tests__/TestServer";

jest.mock("../utils/DbUtils", () => {
  const actual = jest.requireActual("../utils/DbUtils");
  return {
    ...actual,
    DbUtilsExecSQL: jest.fn(actual.DbUtilsExecSQL),
  };
});

import { IsUniqueViolation, VersionsDataCreate } from "./VersionsData";
import * as DbUtils from "../utils/DbUtils";

const execSQLMock = DbUtils.DbUtilsExecSQL as jest.Mock;

const sqliteMigration = fs.readFileSync(
  path.join(__dirname, "../../sql/sqlite/init-0009.sql"),
  "utf-8",
);

describe("Version creation", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("versions-create-user", "user", admin.token);
  });

  afterAll(async () => {
    await server.close();
  });

  async function createBook(name: string): Promise<string> {
    const book = await server.createBook(user.token, name);
    return book.id;
  }

  async function versionNumbers(bookId: string): Promise<number[]> {
    const rows = await server.query(
      "SELECT versionNumber FROM book_versions WHERE bookId = ? ORDER BY versionNumber",
      [bookId],
    );
    return rows.map((row) => row.versionNumber);
  }

  it("allocates sequential version numbers", async () => {
    const bookId = await createBook("Sequential Versions");
    await VersionsDataCreate(bookId, "v1", server.config);
    await VersionsDataCreate(bookId, "v2", server.config);
    await VersionsDataCreate(bookId, "v3", server.config);
    expect(await versionNumbers(bookId)).toEqual([1, 2, 3]);
  });

  it("gives concurrent creations distinct consecutive numbers", async () => {
    const bookId = await createBook("Concurrent Versions");
    const versions = await Promise.all([
      VersionsDataCreate(bookId, "a", server.config),
      VersionsDataCreate(bookId, "b", server.config),
      VersionsDataCreate(bookId, "c", server.config),
    ]);
    expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
    expect(await versionNumbers(bookId)).toEqual([1, 2, 3]);
  });

  it("retries the allocation after a unique violation", async () => {
    const bookId = await createBook("Retry Versions");
    const uniqueError = new Error(
      "UNIQUE constraint failed: book_versions.bookId, book_versions.versionNumber",
    );
    (uniqueError as any).code = "SQLITE_CONSTRAINT_UNIQUE";
    execSQLMock.mockImplementationOnce(async () => {
      throw uniqueError;
    });

    const version = await VersionsDataCreate(bookId, "retry", server.config);
    expect(version.versionNumber).toBe(1);
    expect(await versionNumbers(bookId)).toEqual([1]);
  });

  it("has a unique (bookId, versionNumber) index", async () => {
    const rows = await server.query(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_book_versions_book_number'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sql).toMatch(/UNIQUE/i);
  });

  it("renumbers pre-existing duplicates deterministically in the migration", async () => {
    const bookId = await createBook("Duplicate Versions");
    const first = await VersionsDataCreate(bookId, "first", server.config);
    const second = await VersionsDataCreate(bookId, "second", server.config);
    const idsBefore = [first.id, second.id].sort();

    await server.exec("DROP INDEX idx_book_versions_book_number");
    await server.exec(
      "UPDATE book_versions SET versionNumber = 1 WHERE bookId = ?",
      [bookId],
    );
    await server.execMulti(sqliteMigration);

    expect(await versionNumbers(bookId)).toEqual([1, 2]);
    const rows = await server.query(
      "SELECT id, snapshot FROM book_versions WHERE bookId = ? ORDER BY versionNumber",
      [bookId],
    );
    expect(rows.map((row) => row.id).sort()).toEqual(idsBefore);
    expect(rows.map((row) => row.snapshot).sort()).toEqual(
      [first.snapshot, second.snapshot].sort(),
    );

    const index = await server.query(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_book_versions_book_number'",
    );
    expect(index[0].sql).toMatch(/UNIQUE/i);
  });

  it("includes the book metadata in the snapshot", async () => {
    const bookId = await createBook("Metadata Snapshot");
    const update = await server.inject(
      "PUT",
      `/api/books/${bookId}`,
      user.token,
      { name: "Renamed", description: "Description", writingGoal: 1234 },
    );
    expect(update.statusCode).toBe(200);

    const version = await VersionsDataCreate(bookId, "meta", server.config);
    expect(JSON.parse(version.snapshot).book).toEqual({
      name: "Renamed",
      description: "Description",
      writingGoal: 1234,
    });
  });
});

describe("IsUniqueViolation", () => {
  it("recognizes PostgreSQL and SQLite unique violations", () => {
    expect(IsUniqueViolation({ code: "23505" })).toBe(true);
    expect(IsUniqueViolation({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBe(true);
    expect(
      IsUniqueViolation({
        code: "SQLITE_CONSTRAINT",
        message: "UNIQUE constraint failed: book_versions.bookId",
      }),
    ).toBe(true);
    expect(
      IsUniqueViolation({ message: "duplicate key value violates unique constraint" }),
    ).toBe(true);
  });

  it("rejects other errors", () => {
    expect(IsUniqueViolation(new Error("boom"))).toBe(false);
    expect(IsUniqueViolation({ code: "23503" })).toBe(false);
    expect(IsUniqueViolation(null)).toBe(false);
  });
});
