import { RateLimitResetForTests } from "../utils/RateLimit";
import { TestServer } from "./TestServer";

describe("Sections — optimistic revision (409 conflict)", () => {
  let server: TestServer;
  let admin: { id: string; token: string };

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("conf-admin", "admin");
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  it("creates sections with a revision counter", async () => {
    const owner = await server.createUser(
      "conf-basic-owner",
      "user",
      admin.token,
    );
    const book = await server.createBook(owner.token, "Conflict basics");
    const root = await server.getRootSection(owner.token, book.id);

    const created = await server.inject("POST", "/api/sections", owner.token, {
      bookId: book.id,
      parentId: root.id,
      type: "text",
      title: "Chapter 1",
      content: "original",
    });
    expect(created.statusCode).toBe(201);
    const section = JSON.parse(created.body);
    expect(section.revision).toBe(1);
  });

  it("rejects a stale revision with 409 and the current revision", async () => {
    const owner = await server.createUser("conf-owner", "user", admin.token);
    const rival = await server.createUser("conf-rival", "user", admin.token);
    const book = await server.createBook(owner.token, "Conflict book");

    const grant = await server.inject(
      "PUT",
      `/api/books/${book.id}/access`,
      owner.token,
      { userId: rival.id, permission: "write" },
    );
    expect(grant.statusCode).toBe(200);

    const root = await server.getRootSection(owner.token, book.id);
    const created = await server.inject("POST", "/api/sections", owner.token, {
      bookId: book.id,
      parentId: root.id,
      type: "text",
      title: "Chapter 1",
      content: "original",
    });
    const section = JSON.parse(created.body);
    expect(section.revision).toBe(1);

    // Unconditional update (no revision) still works: backwards compatible
    const r1 = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { content: "unconditional" },
    );
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).revision).toBe(2);

    // The rival still holds revision 1 → 409 with the server's revision
    const r2 = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      rival.token,
      { content: "rival stale", revision: 1 },
    );
    expect(r2.statusCode).toBe(409);
    const conflict = JSON.parse(r2.body);
    expect(conflict.error).toBe("Section was modified by someone else");
    expect(conflict.revision).toBe(2);

    // The losing write was not applied
    const get = await server.inject(
      "GET",
      `/api/sections/${section.id}`,
      rival.token,
    );
    expect(JSON.parse(get.body).content).toBe("unconditional");

    // Saving again with the current revision wins
    const r3 = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      rival.token,
      { content: "rival wins", revision: 2 },
    );
    expect(r3.statusCode).toBe(200);
    expect(JSON.parse(r3.body).revision).toBe(3);
    expect(JSON.parse(r3.body).content).toBe("rival wins");

    // A revision from the future is a conflict too
    const r4 = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { content: "future", revision: 99 },
    );
    expect(r4.statusCode).toBe(409);
    expect(JSON.parse(r4.body).revision).toBe(3);
  });

  it("does not bump the revision when the update conflicts", async () => {
    const owner = await server.createUser(
      "conf-bump-owner",
      "user",
      admin.token,
    );
    const book = await server.createBook(owner.token, "Conflict bump");
    const root = await server.getRootSection(owner.token, book.id);
    const created = await server.inject("POST", "/api/sections", owner.token, {
      bookId: book.id,
      parentId: root.id,
      type: "text",
      title: "Chapter 1",
    });
    const section = JSON.parse(created.body);

    await server.inject("PUT", `/api/sections/${section.id}`, owner.token, {
      content: "v1",
      revision: 1,
    });

    // Two stale attempts must not advance the revision
    await server.inject("PUT", `/api/sections/${section.id}`, owner.token, {
      content: "stale-a",
      revision: 1,
    });
    await server.inject("PUT", `/api/sections/${section.id}`, owner.token, {
      content: "stale-b",
      revision: 1,
    });

    const get = await server.inject(
      "GET",
      `/api/sections/${section.id}`,
      owner.token,
    );
    const body = JSON.parse(get.body);
    expect(body.revision).toBe(2);
    expect(body.content).toBe("v1");

    // And the still-valid revision 2 keeps working
    const ok = await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      owner.token,
      { content: "v2", revision: 2 },
    );
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).revision).toBe(3);
  });
});
