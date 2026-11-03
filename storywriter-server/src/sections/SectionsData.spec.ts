import { TestServer, TestUser } from "../__tests__/TestServer";

describe("Section deletion transaction", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;
  let bookId: string;
  let otherBookId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("sections-delete-user", "user", admin.token);
    const book = await server.createBook(user.token, "Sections Book");
    bookId = book.id;
    const other = await server.createBook(user.token, "Other Book");
    otherBookId = other.id;
  });

  afterAll(async () => {
    await server.close();
  });

  async function addChild(
    targetBookId: string,
    parentId: string,
    title: string,
    type = "text",
  ): Promise<string> {
    const res = await server.inject("POST", "/api/sections", user.token, {
      bookId: targetBookId,
      parentId,
      title,
      type,
      content: `Content of ${title}`,
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id;
  }

  it("rolls back the whole delete (including detach) when a statement fails", async () => {
    const root = await server.getRootSection(user.token, bookId);
    const chapterId = await addChild(bookId, root.id, "Chapter", "container");
    const childId = await addChild(bookId, chapterId, "Sub-chapter");

    // Data created before cross-book parents were rejected: a child of this
    // book's chapter that belongs to another book. Deleting the chapter must
    // detach it, not delete it.
    const foreignRoot = await server.getRootSection(user.token, otherBookId);
    const foreignId = "legacy-foreign-child";
    await server.exec(
      `INSERT INTO sections (id, bookId, parentId, type, title, content, analysis, mediaId, caption, orderIndex, dateCreated, dateUpdated)
       VALUES (?, ?, ?, 'text', 'Foreign', '', '', NULL, '', 0, ?, ?)`,
      [
        foreignId,
        otherBookId,
        chapterId,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    await server.exec(
      `CREATE TRIGGER fail_section_delete BEFORE DELETE ON sections
       WHEN OLD.id = '${chapterId}'
       BEGIN
         SELECT RAISE(ABORT, 'boom');
       END`,
    );
    try {
      const res = await server.inject(
        "DELETE",
        `/api/sections/${chapterId}`,
        user.token,
      );
      expect(res.statusCode).toBe(500);
    } finally {
      await server.exec("DROP TRIGGER fail_section_delete");
    }

    // Everything rolled back, including the detach of the foreign child.
    expect(
      await server.query("SELECT id FROM sections WHERE id = ?", [chapterId]),
    ).toHaveLength(1);
    expect(
      await server.query("SELECT id FROM sections WHERE id = ?", [childId]),
    ).toHaveLength(1);
    const foreign = await server.query(
      "SELECT parentId FROM sections WHERE id = ?",
      [foreignId],
    );
    expect(foreign).toHaveLength(1);
    expect(foreign[0].parentId).toBe(chapterId);

    // Happy path: the subtree is deleted and the foreign child survives,
    // detached under its own book's root.
    const del = await server.inject(
      "DELETE",
      `/api/sections/${chapterId}`,
      user.token,
    );
    expect(del.statusCode).toBe(200);
    expect(
      await server.query("SELECT id FROM sections WHERE id IN (?, ?)", [
        chapterId,
        childId,
      ]),
    ).toHaveLength(0);
    const detached = await server.query(
      "SELECT parentId FROM sections WHERE id = ?",
      [foreignId],
    );
    expect(detached[0].parentId).toBe(foreignRoot.id);
  });
});
