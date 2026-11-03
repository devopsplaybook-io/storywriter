import { TestServer, TestUser } from "../__tests__/TestServer";

describe("Book contentVersion", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;
  let bookId: string;
  let rootId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("content-version-user", "user", admin.token);
    const book = await server.createBook(user.token, "Version Book");
    bookId = book.id;
    rootId = (await server.getRootSection(user.token, bookId)).id;
  });

  afterAll(async () => {
    await server.close();
  });

  async function version(): Promise<number> {
    const rows = await server.query(
      "SELECT contentVersion FROM books WHERE id = ?",
      [bookId],
    );
    return Number(rows[0].contentVersion);
  }

  it("starts at 1 and bumps on book metadata changes only", async () => {
    expect(await version()).toBe(1);

    const noop = await server.inject("PUT", `/api/books/${bookId}`, user.token, {
      name: "Version Book",
    });
    expect(noop.statusCode).toBe(200);
    expect(await version()).toBe(1);

    const changed = await server.inject(
      "PUT",
      `/api/books/${bookId}`,
      user.token,
      { description: "Now with a description" },
    );
    expect(changed.statusCode).toBe(200);
    expect(await version()).toBe(2);
  });

  it("bumps on section create and on real updates, not on no-op saves", async () => {
    const before = await version();
    const created = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: rootId,
      title: "Chapter",
      content: "Hello",
    });
    expect(created.statusCode).toBe(201);
    const section = JSON.parse(created.body);
    expect(await version()).toBe(before + 1);

    const noop = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      user.token,
      { title: "Chapter", content: "Hello", revision: section.revision },
    );
    expect(noop.statusCode).toBe(200);
    expect(await version()).toBe(before + 1);

    const changed = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      user.token,
      { content: "Hello again", revision: JSON.parse(noop.body).revision },
    );
    expect(changed.statusCode).toBe(200);
    expect(await version()).toBe(before + 2);
  });

  it("bumps on attribute and property writes", async () => {
    const before = await version();

    const attr = await server.inject(
      "POST",
      "/api/book-attributes",
      user.token,
      { bookId, title: "Protagonist", content: "Aria" },
    );
    expect(attr.statusCode).toBe(201);
    expect(await version()).toBe(before + 1);

    const property = await server.inject("POST", "/api/properties", user.token, {
      bookId,
      name: "Status",
    });
    expect(property.statusCode).toBe(201);
    expect(await version()).toBe(before + 2);

    const attrId = JSON.parse(attr.body).id;
    const attrUpdate = await server.inject(
      "PUT",
      `/api/book-attributes/${attrId}`,
      user.token,
      { content: "Aria the cartographer" },
    );
    expect(attrUpdate.statusCode).toBe(200);
    expect(await version()).toBe(before + 3);
  });

  it("bumps on property value changes, not on identical writes", async () => {
    const property = await server.inject("POST", "/api/properties", user.token, {
      bookId,
      name: "Stage",
    });
    const propertyId = JSON.parse(property.body).id;
    const section = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: rootId,
      title: "Scene",
      content: "",
    });
    const sectionId = JSON.parse(section.body).id;
    const before = await version();

    const first = await server.inject(
      "PUT",
      `/api/properties/section/${sectionId}`,
      user.token,
      { propertyId, value: "Draft" },
    );
    expect(first.statusCode).toBe(200);
    expect(await version()).toBe(before + 1);

    const again = await server.inject(
      "PUT",
      `/api/properties/section/${sectionId}`,
      user.token,
      { propertyId, value: "Draft" },
    );
    expect(again.statusCode).toBe(200);
    expect(await version()).toBe(before + 1);

    const changed = await server.inject(
      "PUT",
      `/api/properties/section/${sectionId}`,
      user.token,
      { propertyId, value: "Final" },
    );
    expect(changed.statusCode).toBe(200);
    expect(await version()).toBe(before + 2);
  });

  it("bumps on media upload and delete", async () => {
    const before = await version();
    const upload = await server.uploadMedia(
      user.token,
      bookId,
      "cover.png",
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 9),
      ]),
      "image/png",
    );
    expect(upload.statusCode).toBe(201);
    expect(await version()).toBe(before + 1);

    const mediaId = JSON.parse(upload.body).id;
    const del = await server.inject(
      "DELETE",
      `/api/books/${bookId}/media/${mediaId}`,
      user.token,
    );
    expect(del.statusCode).toBe(200);
    expect(await version()).toBe(before + 2);
  });

  it("bumps on section deletion", async () => {
    const section = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: rootId,
      title: "Temporary",
      content: "",
    });
    const sectionId = JSON.parse(section.body).id;
    const before = await version();

    const del = await server.inject(
      "DELETE",
      `/api/sections/${sectionId}`,
      user.token,
    );
    expect(del.statusCode).toBe(200);
    expect(await version()).toBe(before + 1);
  });
});
