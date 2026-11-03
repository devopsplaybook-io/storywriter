import { TestServer, TestUser } from "../__tests__/TestServer";

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
