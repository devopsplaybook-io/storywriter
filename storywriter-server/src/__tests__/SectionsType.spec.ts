import { TestServer, TestUser } from "./TestServer";

describe("Sections — structural type", () => {
  let server: TestServer;
  let admin: TestUser;
  let owner: TestUser;
  let bookId: string;
  let root: { id: string };

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("type-admin", "admin");
    owner = await server.createUser("type-owner", "user", admin.token);
    const book = await server.createBook(owner.token, "Type Book");
    bookId = book.id;
    root = await server.getRootSection(owner.token, bookId);
  });

  afterAll(async () => {
    await server.close();
  });

  async function createSection(type: string, extra: Record<string, unknown> = {}) {
    return server.inject("POST", "/api/sections", owner.token, {
      bookId,
      parentId: root.id,
      type,
      title: `Type ${type}`,
      ...extra,
    });
  }

  it("creates each valid type", async () => {
    for (const type of ["text", "container", "media"]) {
      const res = await createSection(type);
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).type).toBe(type);
    }
  });

  it("rejects an unknown type on create with 400", async () => {
    const res = await createSection("video");
    expect(res.statusCode).toBe(400);
    expect(typeof JSON.parse(res.body).error).toBe("string");
  });

  it("changes text → media and media → text", async () => {
    const created = await createSection("text", {
      title: "Picture",
      content: "Some prose",
    });
    const section = JSON.parse(created.body);

    const toMedia = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { type: "media", revision: section.revision },
    );
    expect(toMedia.statusCode).toBe(200);
    const media = JSON.parse(toMedia.body);
    expect(media.type).toBe("media");
    // Content is never destroyed by a type change
    expect(media.content).toBe("Some prose");

    const toText = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { type: "text", revision: media.revision },
    );
    expect(toText.statusCode).toBe(200);
    expect(JSON.parse(toText.body).type).toBe("text");
    expect(JSON.parse(toText.body).content).toBe("Some prose");
  });

  it("changes an empty container into a text section", async () => {
    const created = await createSection("container");
    const section = JSON.parse(created.body);
    const res = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { type: "text", revision: section.revision },
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).type).toBe("text");
  });

  it("keeps the caption when the type changes", async () => {
    const created = await createSection("media", { caption: "A caption" });
    const section = JSON.parse(created.body);
    const res = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { type: "text", revision: section.revision },
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).caption).toBe("A caption");
  });

  it("rejects an unknown type on update with 400", async () => {
    const created = await createSection("text");
    const section = JSON.parse(created.body);
    const res = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { type: "image", revision: section.revision },
    );
    expect(res.statusCode).toBe(400);
    expect(typeof JSON.parse(res.body).error).toBe("string");
  });

  it("rejects converting a container that still has children", async () => {
    const parent = JSON.parse((await createSection("container")).body);
    const child = await server.inject("POST", "/api/sections", owner.token, {
      bookId,
      parentId: parent.id,
      type: "text",
      title: "Child",
    });
    expect(child.statusCode).toBe(201);

    for (const type of ["text", "media"]) {
      const res = await server.inject(
        "PUT",
        `/api/sections/${parent.id}`,
        owner.token,
        { type },
      );
      expect(res.statusCode).toBe(400);
      expect(typeof JSON.parse(res.body).error).toBe("string");
    }

    const get = await server.inject(
      "GET",
      `/api/sections/${parent.id}`,
      owner.token,
    );
    expect(JSON.parse(get.body).type).toBe("container");
  });

  it("keeps the root a container", async () => {
    for (const type of ["text", "media"]) {
      const res = await server.inject(
        "PUT",
        `/api/sections/${root.id}`,
        owner.token,
        { type },
      );
      expect(res.statusCode).toBe(400);
    }
    // Reasserting container (with no other change) is not a transition
    const allowed = await server.inject(
      "PUT",
      `/api/sections/${root.id}`,
      owner.token,
      { type: "container" },
    );
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).type).toBe("container");
  });
});
