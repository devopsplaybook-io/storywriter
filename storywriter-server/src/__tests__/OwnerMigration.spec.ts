import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import Database from "better-sqlite3";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import {
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
} from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import { OTelLogger, OTelSetTracer } from "../OTelContext";
import { BooksDataGet, BooksDataListForUser } from "../books/BooksData";

const SQL_DIR = path.join(__dirname, "../../sql/sqlite");

describe("Book owner migration (init-0006)", () => {
  let dataDir: string;
  let config: Config;

  const adminId = "user-admin";
  const aliceId = "user-alice";

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "storywriter-migration-"),
    );
    const dbPath = path.join(dataDir, "database.db");
    const db = new Database(dbPath);
    try {
      // Pre-0006 schema: apply migrations 0000..0005 and record them.
      for (let version = 0; version <= 5; version++) {
        const file = path.join(
          SQL_DIR,
          `init-${String(version).padStart(4, "0")}.sql`,
        );
        db.exec(await fs.readFile(file, "utf-8"));
        if (version > 0) {
          db.prepare(
            "INSERT INTO metadata (type, value, dateCreated) VALUES ('db_version', ?, ?)",
          ).run(String(version), new Date().toISOString());
        }
      }

      const now = new Date().toISOString();
      const insertUser = db.prepare(
        "INSERT INTO users (id, name, passwordEncrypted, role, scopes) VALUES (?, ?, ?, ?, '[]')",
      );
      insertUser.run(adminId, "admin", "x", "admin");
      insertUser.run(aliceId, "alice", "x", "user");

      const insertBook = db.prepare(
        'INSERT INTO books (id, name, description, "dateCreated", "writingGoal") VALUES (?, ?, \'\', ?, 0)',
      );
      insertBook.run("book-a", "Book A", now);
      insertBook.run("book-b", "Book B", now);
      insertBook.run("book-c", "Book C", now);

      const insertAccess = db.prepare(
        'INSERT INTO book_access ("bookId", "userId", permission) VALUES (?, ?, ?)',
      );
      insertAccess.run("book-a", aliceId, "write");
      insertAccess.run("book-b", aliceId, "read");
    } finally {
      db.close();
    }

    config = new Config();
    config.DATA_DIR = dataDir;
    config.DATABASE_TYPE = "sqlite";
    config.OPENTELEMETRY_COLLECTOR_HTTP_TRACES = "";
    config.OPENTELEMETRY_COLLECTOR_HTTP_METRICS = "";
    config.OPENTELEMETRY_COLLECTOR_HTTP_LOGS = "";

    const tracer = new StandardTracer(config);
    OTelSetTracer(tracer);
    DbUtilsSetOTel(tracer, OTelLogger());
    const span = tracer.startSpan("migration-test");
    await DbUtilsInit(span, config, SQL_DIR);
    span.end();
  });

  afterAll(async () => {
    try {
      DbUtilsGetDatabase()?.close?.();
    } catch {
      // Ignore double-close errors
    }
    await fs.remove(dataDir);
  });

  it("backfills the first write grantee as owner", async () => {
    const bookA = await BooksDataGet("book-a");
    expect(bookA.ownerId).toBe(aliceId);
  });

  it("backfills the first admin for books without a write grant", async () => {
    const bookB = await BooksDataGet("book-b");
    const bookC = await BooksDataGet("book-c");
    expect(bookB.ownerId).toBe(adminId);
    expect(bookC.ownerId).toBe(adminId);
  });

  it("inserts a write access row for every backfilled owner", async () => {
    const rows = await DbUtilsQuerySQL(
      undefined,
      "SELECT bookId, userId, permission FROM book_access ORDER BY bookId",
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { bookId: "book-a", userId: aliceId, permission: "write" },
        { bookId: "book-b", userId: adminId, permission: "write" },
        { bookId: "book-c", userId: adminId, permission: "write" },
      ]),
    );
  });

  it("lists only owned or granted books for a user", async () => {
    const aliceBooks = await BooksDataListForUser(aliceId);
    expect(aliceBooks.map((b) => b.id).sort()).toEqual(["book-a", "book-b"]);
  });

  it("no longer lists zero-access books globally", async () => {
    const otherBooks = await BooksDataListForUser("user-unknown");
    expect(otherBooks).toEqual([]);
  });
});
