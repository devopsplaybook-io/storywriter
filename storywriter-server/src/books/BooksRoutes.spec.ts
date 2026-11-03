import { TestServer, TestUser } from "../__tests__/TestServer";
import * as http from "http";
import { ConcurrencyActive, RateLimitResetForTests } from "../utils/RateLimit";

jest.mock("../properties/PropertiesData", () => {
  const actual = jest.requireActual("../properties/PropertiesData");
  return {
    ...actual,
    PropertiesDataAdd: jest.fn(actual.PropertiesDataAdd),
  };
});

import * as PropertiesData from "../properties/PropertiesData";

const propertiesDataAddMock = PropertiesData.PropertiesDataAdd as jest.Mock;

describe("Book creation transaction", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("book-create-user", "user", admin.token);
  });

  afterAll(async () => {
    await server.close();
  });

  async function rowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of ["books", "sections", "book_properties", "book_access"]) {
      const rows = await server.query(
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      counts[table] = Number(rows[0].count);
    }
    return counts;
  }

  it("creates the book, root section, default property and owner access", async () => {
    const res = await server.inject("POST", "/api/books", user.token, {
      name: "Normal Book",
    });
    expect(res.statusCode).toBe(201);
    const book = JSON.parse(res.body);
    expect(
      await server.query("SELECT id FROM sections WHERE bookId = ?", [book.id]),
    ).toHaveLength(1);
    expect(
      await server.query("SELECT id FROM book_properties WHERE bookId = ?", [
        book.id,
      ]),
    ).toHaveLength(1);
    expect(
      await server.query("SELECT userId FROM book_access WHERE bookId = ?", [
        book.id,
      ]),
    ).toHaveLength(1);
  });

  it("leaves no partial book when a later write fails", async () => {
    const before = await rowCounts();
    propertiesDataAddMock.mockRejectedValueOnce(new Error("boom"));

    const res = await server.inject("POST", "/api/books", user.token, {
      name: "Partial Book",
    });
    expect(res.statusCode).toBe(500);
    expect(typeof JSON.parse(res.body).error).toBe("string");

    expect(await rowCounts()).toEqual(before);
    expect(
      await server.query("SELECT id FROM books WHERE name = ?", ["Partial Book"]),
    ).toHaveLength(0);
  });
});

describe("Book export stream slot", () => {
  let server: TestServer;
  let admin: TestUser;
  let user: TestUser;
  let bookId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    user = await server.createUser("export-slot-user", "user", admin.token);
    const book = await server.createBook(user.token, "Export Slot Book");
    bookId = book.id;
    server.config.IMPORT_EXPORT_CONCURRENCY = 1;
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    RateLimitResetForTests();
  });

  it("releases the slot when the streamed response completes", async () => {
    const first = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    expect(first.statusCode).toBe(200);
    expect(ConcurrencyActive(`import-export:${user.id}`)).toBe(0);

    // With a single slot, only a released export allows the next one.
    const second = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    expect(second.statusCode).toBe(200);
    expect(ConcurrencyActive(`import-export:${user.id}`)).toBe(0);
  });

  it("releases the slot when the client aborts the stream", async () => {
    await server.app.listen({ port: 0, host: "127.0.0.1" });
    const address = server.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await new Promise<void>((resolve) => {
      const req = http.get(
        {
          port,
          path: `/api/books/${bookId}/export?format=targz`,
          headers: { authorization: `Bearer ${user.token}` },
        },
        (res) => {
          res.once("data", () => {
            req.destroy();
            resolve();
          });
          res.once("end", () => resolve());
          res.resume();
        },
      );
      req.on("error", () => resolve());
    });

    for (let i = 0; i < 100; i++) {
      if (ConcurrencyActive(`import-export:${user.id}`) === 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(ConcurrencyActive(`import-export:${user.id}`)).toBe(0);
  });
});
