import { TestServer, TestUser } from "./TestServer";

describe("Sections — copy duplicates section-type labels", () => {
  let server: TestServer;
  let admin: TestUser;
  let owner: TestUser;
  let bookId: string;
  let propertyId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("copy-admin", "admin");
    owner = await server.createUser("copy-owner", "user", admin.token);
    const book = await server.createBook(owner.token, "Copy Book");
    bookId = book.id;
    const props = await server.inject(
      "GET",
      `/api/properties?bookId=${bookId}`,
      owner.token,
    );
    propertyId = JSON.parse(props.body)[0].id;
  });

  afterAll(async () => {
    await server.close();
  });

  async function addSection(parentId: string, title: string, type = "text") {
    const res = await server.inject("POST", "/api/sections", owner.token, {
      bookId,
      parentId,
      type,
      title,
      content: `Content of ${title}`,
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  async function assignLabels(sectionId: string, value: string) {
    const res = await server.inject(
      "PUT",
      `/api/properties/section/${sectionId}`,
      owner.token,
      { propertyId, value },
    );
    expect(res.statusCode).toBe(200);
  }

  async function readValue(sectionId: string): Promise<string | null> {
    const res = await server.inject(
      "GET",
      `/api/properties/section/${sectionId}`,
      owner.token,
    );
    expect(res.statusCode).toBe(200);
    const row = JSON.parse(res.body).find(
      (v: { propertyId: string }) => v.propertyId === propertyId,
    );
    return row ? row.value : null;
  }

  it("copies the labels of the whole subtree and keeps AI notes empty", async () => {
    const root = await server.getRootSection(owner.token, bookId);
    const part = await addSection(root.id, "Part", "container");
    const scene = await addSection(part.id, "Scene");
    await assignLabels(part.id, "Chapter");
    await assignLabels(scene.id, "Chapter,Scene");

    const res = await server.inject(
      "POST",
      `/api/sections/${part.id}/copy`,
      owner.token,
      { targetParentId: root.id, orderIndex: 0 },
    );
    expect(res.statusCode).toBe(201);
    const partCopy = JSON.parse(res.body);
    expect(partCopy.title).toBe("Part (copy)");
    expect(partCopy.analysis).toBe("");

    const sectionsRes = await server.inject(
      "GET",
      `/api/sections?bookId=${bookId}`,
      owner.token,
    );
    const sections = JSON.parse(sectionsRes.body);
    const sceneCopy = sections.find(
      (s: { parentId: string; title: string }) =>
        s.parentId === partCopy.id && s.title === "Scene (copy)",
    );
    expect(sceneCopy).toBeDefined();
    expect(sceneCopy.analysis).toBe("");

    expect(await readValue(partCopy.id)).toBe("Chapter");
    expect(await readValue(sceneCopy.id)).toBe("Chapter,Scene");
  });
});
