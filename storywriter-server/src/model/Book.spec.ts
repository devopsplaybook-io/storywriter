import { Book } from "./Book";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("Book", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const book = new Book();
      expect(book.id).toBe("test-uuid-1");
      expect(book.description).toBe("");
      expect(book.dateCreated).toBeDefined();
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(Book.fromJson(null)).toBeNull();
    });

    it("should create a Book from JSON data", () => {
      const json = {
        id: "book-1",
        name: "Test Book",
        description: "A test book",
        dateCreated: "2024-01-01T00:00:00.000Z",
      };
      const book = Book.fromJson(json);
      expect(book.id).toBe("book-1");
      expect(book.name).toBe("Test Book");
      expect(book.description).toBe("A test book");
      expect(book.dateCreated).toBe("2024-01-01T00:00:00.000Z");
    });

    it("should use defaults for missing fields", () => {
      const json = { name: "Test Book" };
      const book = Book.fromJson(json);
      expect(book.name).toBe("Test Book");
      expect(book.description).toBe("");
      expect(book.dateCreated).toBeDefined();
    });
  });

  describe("toJson", () => {
    it("should return a JSON representation", () => {
      const book = new Book();
      book.name = "Test Book";
      book.description = "A test book";
      const json = book.toJson();
      expect(json.id).toBe(book.id);
      expect(json.name).toBe("Test Book");
      expect(json.description).toBe("A test book");
      expect(json.dateCreated).toBe(book.dateCreated);
    });
  });

  describe("toTransportJson", () => {
    it("should return the same as toJson", () => {
      const book = new Book();
      book.name = "Test Book";
      expect(book.toTransportJson()).toEqual(book.toJson());
    });
  });
});
