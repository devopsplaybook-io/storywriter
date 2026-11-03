import { TestServer, TestUser } from "../__tests__/TestServer";

describe("Bulk section reorder", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;
  let bookId: string;
  let rootId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("reorder-user", "user", admin.token);
    const book = await server.createBook(user.token, "Reorder Book");
    bookId = book.id;
    rootId = (await server.getRootSection(user.token, bookId)).id;
  });

  afterAll(async () => {
    await server.close();
  });

  async function addSection(title: string): Promise<string> {
    const res = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: rootId,
      title,
      content: `Content of ${title}`,
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id;
  }

  async function childrenOrder(parentId: string): Promise<string[]> {
    const rows = await server.query(
      "SELECT id FROM sections WHERE parentId = ? ORDER BY orderIndex",
      [parentId],
    );
    return rows.map((row) => row.id);
  }

  async function contentVersion(): Promise<number> {
    const rows = await server.query(
      "SELECT contentVersion FROM books WHERE id = ?",
      [bookId],
    );
    return Number(rows[0].contentVersion);
  }

  it("reorders all children in a single request and bumps the version once", async () => {
    const a = await addSection("A");
    const b = await addSection("B");
    const c = await addSection("C");
    expect(await childrenOrder(rootId)).toEqual([a, b, c]);
    const versionBefore = await contentVersion();

    const res = await server.inject("PUT", "/api/sections/reorder", user.token, {
      parentId: rootId,
      sectionIds: [c, a, b],
    });

    expect(res.statusCode).toBe(200);
    expect(await childrenOrder(rootId)).toEqual([c, a, b]);
    expect(await contentVersion()).toBe(versionBefore + 1);

    // A no-op reorder returns success without bumping the version.
    const noop = await server.inject(
      "PUT",
      "/api/sections/reorder",
      user.token,
      { parentId: rootId, sectionIds: [c, a, b] },
    );
    expect(noop.statusCode).toBe(200);
    expect(await contentVersion()).toBe(versionBefore + 1);
  });

  it("validates the request body", async () => {
    const missing = await server.inject(
      "PUT",
      "/api/sections/reorder",
      user.token,
      { sectionIds: [] },
    );
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body).error).toBe("Missing: parentId");

    for (const sectionIds of [
      [],
      ["not", "not"],
      ["ok", ""],
      [1, 2],
      "nope",
    ]) {
      const res = await server.inject(
        "PUT",
        "/api/sections/reorder",
        user.token,
        { parentId: rootId, sectionIds },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("Invalid: sectionIds");
    }
  });

  it("returns 404 for an unknown parent", async () => {
    const res = await server.inject("PUT", "/api/sections/reorder", user.token, {
      parentId: "missing-parent",
      sectionIds: ["x"],
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects ids that are not the exact current children", async () => {
    const current = await childrenOrder(rootId);
    const foreign = await addSection("Foreign-but-sibling");

    const missingChild = await server.inject(
      "PUT",
      "/api/sections/reorder",
      user.token,
      { parentId: rootId, sectionIds: current.slice(1) },
    );
    expect(missingChild.statusCode).toBe(400);
    expect(JSON.parse(missingChild.body).error).toBe(
      "sectionIds must match the current children",
    );

    const extraChild = await server.inject(
      "PUT",
      "/api/sections/reorder",
      user.token,
      {
        parentId: rootId,
        sectionIds: [...current, "not-a-child"],
      },
    );
    expect(extraChild.statusCode).toBe(400);

    // Clean up the sibling added above.
    await server.inject("DELETE", `/api/sections/${foreign}`, user.token);
  });

  it("requires write access to the parent's book", async () => {
    const outsider = await server.createUser(
      "reorder-outsider",
      "user",
      admin.token,
    );
    const current = await childrenOrder(rootId);
    const res = await server.inject(
      "PUT",
      "/api/sections/reorder",
      outsider.token,
      { parentId: rootId, sectionIds: current },
    );
    expect(res.statusCode).toBe(403);
  });

  it("rolls back every order change when one statement fails", async () => {
    const before = await childrenOrder(rootId);
    const versionBefore = await contentVersion();

    await server.exec(`
      CREATE TRIGGER fail_reorder BEFORE UPDATE OF orderIndex ON sections
      WHEN NEW.orderIndex = 1
      BEGIN
        SELECT RAISE(ABORT, 'boom');
      END
    `);
    try {
      const res = await server.inject(
        "PUT",
        "/api/sections/reorder",
        user.token,
        { parentId: rootId, sectionIds: [...before].reverse() },
      );
      expect(res.statusCode).toBe(500);
    } finally {
      await server.exec("DROP TRIGGER fail_reorder");
    }

    expect(await childrenOrder(rootId)).toEqual(before);
    expect(await contentVersion()).toBe(versionBefore);
  });
});
