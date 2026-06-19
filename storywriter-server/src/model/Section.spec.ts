import { Section } from "./Section";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("Section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const section = new Section();
      expect(section.id).toBe("test-uuid-1");
      expect(section.parentId).toBeNull();
      expect(section.type).toBe("text");
      expect(section.title).toBe("");
      expect(section.content).toBe("");
      expect(section.analysis).toBe("");
      expect(section.mediaId).toBeNull();
      expect(section.caption).toBe("");
      expect(section.orderIndex).toBe(0);
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(Section.fromJson(null)).toBeNull();
    });

    it("should create a Section from JSON data", () => {
      const json = {
        id: "section-1",
        bookId: "book-1",
        parentId: "parent-1",
        type: "container",
        title: "Chapter 1",
        content: "Content...",
        analysis: "Analysis...",
        mediaId: "media-1",
        caption: "A caption",
        orderIndex: 2,
        dateCreated: "2024-01-01T00:00:00.000Z",
        dateUpdated: "2024-01-02T00:00:00.000Z",
      };
      const section = Section.fromJson(json);
      expect(section.id).toBe("section-1");
      expect(section.bookId).toBe("book-1");
      expect(section.parentId).toBe("parent-1");
      expect(section.type).toBe("container");
      expect(section.title).toBe("Chapter 1");
      expect(section.content).toBe("Content...");
      expect(section.analysis).toBe("Analysis...");
      expect(section.mediaId).toBe("media-1");
      expect(section.caption).toBe("A caption");
      expect(section.orderIndex).toBe(2);
    });

    it("should default parentId and mediaId to null", () => {
      const json = { id: "sec-1", bookId: "book-1", title: "Test" };
      const section = Section.fromJson(json);
      expect(section.parentId).toBeNull();
      expect(section.mediaId).toBeNull();
    });
  });

  describe("toJson / toTransportJson", () => {
    it("should have same structure in both methods", () => {
      const section = new Section();
      section.bookId = "book-1";
      section.title = "Test Section";
      section.content = "Content";
      expect(section.toJson()).toEqual(section.toTransportJson());
    });
  });
});
