import { BookVersion } from "./BookVersion";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("BookVersion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const version = new BookVersion();
      expect(version.id).toBe("test-uuid-1");
      expect(version.versionNumber).toBe(1);
      expect(version.note).toBe("");
      expect(version.snapshot).toBe("{}");
      expect(version.dateCreated).toBeDefined();
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(BookVersion.fromJson(null)).toBeNull();
    });

    it("should create a BookVersion from JSON data", () => {
      const json = {
        id: "ver-1",
        bookId: "book-1",
        versionNumber: 3,
        note: "Added new chapters",
        snapshot: '{"sections":[],"attributes":[],"mediaMeta":[]}',
        dateCreated: "2024-01-01T00:00:00.000Z",
      };
      const version = BookVersion.fromJson(json);
      expect(version.id).toBe("ver-1");
      expect(version.bookId).toBe("book-1");
      expect(version.versionNumber).toBe(3);
      expect(version.note).toBe("Added new chapters");
      expect(version.snapshot).toBe('{"sections":[],"attributes":[],"mediaMeta":[]}');
      expect(version.dateCreated).toBe("2024-01-01T00:00:00.000Z");
    });

    it("should default missing fields", () => {
      const json = { bookId: "book-1" };
      const version = BookVersion.fromJson(json);
      expect(version.versionNumber).toBe(1);
      expect(version.note).toBe("");
      expect(version.snapshot).toBe("{}");
    });
  });

  describe("toJson / toTransportJson", () => {
    it("should have same structure in both methods", () => {
      const version = new BookVersion();
      version.bookId = "book-1";
      version.versionNumber = 2;
      version.note = "Test version";
      expect(version.toJson()).toEqual(version.toTransportJson());
    });
  });
});
