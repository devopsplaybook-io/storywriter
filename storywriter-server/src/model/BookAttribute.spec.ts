import { BookAttribute } from "./BookAttribute";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("BookAttribute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const attr = new BookAttribute();
      expect(attr.id).toBe("test-uuid-1");
      expect(attr.title).toBe("");
      expect(attr.content).toBe("");
      expect(attr.dateCreated).toBeDefined();
      expect(attr.dateUpdated).toBeDefined();
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(BookAttribute.fromJson(null)).toBeNull();
    });

    it("should create a BookAttribute from JSON data", () => {
      const json = {
        id: "attr-1",
        bookId: "book-1",
        title: "Chapter 1",
        content: "Content here",
        dateCreated: "2024-01-01T00:00:00.000Z",
        dateUpdated: "2024-01-02T00:00:00.000Z",
      };
      const attr = BookAttribute.fromJson(json);
      expect(attr.id).toBe("attr-1");
      expect(attr.bookId).toBe("book-1");
      expect(attr.title).toBe("Chapter 1");
      expect(attr.content).toBe("Content here");
      expect(attr.dateCreated).toBe("2024-01-01T00:00:00.000Z");
      expect(attr.dateUpdated).toBe("2024-01-02T00:00:00.000Z");
    });
  });

  describe("toJson / toTransportJson", () => {
    it("should have same structure in both methods", () => {
      const attr = new BookAttribute();
      attr.bookId = "book-1";
      attr.title = "Test Attribute";
      expect(attr.toJson()).toEqual(attr.toTransportJson());
    });
  });
});
