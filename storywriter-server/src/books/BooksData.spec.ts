import { TestServer, TestUser } from "../__tests__/TestServer";
import { DbUtilsTableExists } from "../utils/DbUtils";

describe("Books data", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("books-data-user", "user", admin.token);
  });

  afterAll(async () => {
    await server.close();
  });

  async function createBookWithContent(name: string): Promise<string> {
    const book = await server.createBook(user.token, name);
    const root = await server.getRootSection(user.token, book.id);
    const res = await server.inject("POST", "/api/sections", user.token, {
      bookId: book.id,
      parentId: root.id,
      title: "Chapter 1",
      content: "Some content",
    });
    expect(res.statusCode).toBe(201);
    const versionRes = await server.inject(
      "POST",
      `/api/books/${book.id}/versions`,
      user.token,
      { note: "v1" },
    );
    expect(versionRes.statusCode).toBe(201);
    return book.id;
  }

  async function expectBookGone(bookId: string): Promise<void> {
    for (const table of [
      "books",
      "sections",
      "book_properties",
      "book_access",
    ]) {
      const rows = await server.query(
        `SELECT * FROM ${table} WHERE ${table === "books" ? "id" : "bookId"} = ?`,
        [bookId],
      );
      expect(rows).toHaveLength(0);
    }
  }

  it("detects whether optional tables exist", async () => {
    expect(await DbUtilsTableExists("books")).toBe(true);
    expect(await DbUtilsTableExists("book_versions")).toBe(true);
    // Dropped by init-0002
    expect(await DbUtilsTableExists("section_versions")).toBe(false);
    expect(await DbUtilsTableExists("book_attribute_versions")).toBe(false);
    expect(await DbUtilsTableExists("does_not_exist")).toBe(false);
  });

  it("deletes the book and its child rows, including version history", async () => {
    const bookId = await createBookWithContent("Delete Me");

    const del = await server.inject("DELETE", `/api/books/${bookId}`, user.token);
    expect(del.statusCode).toBe(200);

    await expectBookGone(bookId);
    expect(
      await server.query("SELECT * FROM book_versions WHERE bookId = ?", [bookId]),
    ).toHaveLength(0);
  });

  it("still deletes a book when book_versions is missing", async () => {
    // The legacy version tables were dropped by init-0002; book_versions is
    // dropped here too to exercise the optional branch without any catch.
    await server.exec("DROP TABLE book_versions");
    expect(await DbUtilsTableExists("book_versions")).toBe(false);

    const book = await server.createBook(user.token, "No Versions Table");
    const root = await server.getRootSection(user.token, book.id);
    await server.inject("POST", "/api/sections", user.token, {
      bookId: book.id,
      parentId: root.id,
      title: "Chapter 1",
    });

    const del = await server.inject("DELETE", `/api/books/${book.id}`, user.token);
    expect(del.statusCode).toBe(200);
    await expectBookGone(book.id);
  });
});
