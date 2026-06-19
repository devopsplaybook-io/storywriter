import { Property } from "./Property";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("Property", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const prop = new Property();
      expect(prop.id).toBe("test-uuid-1");
      expect(prop.type).toBe("section-type");
      expect(prop.options).toEqual([]);
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(Property.fromJson(null)).toBeNull();
    });

    it("should create a Property from JSON data", () => {
      const json = {
        id: "prop-1",
        bookId: "book-1",
        name: "Section Types",
        type: "section-type",
        options: ["Chapter", "Scene"],
        dateCreated: "2024-01-01T00:00:00.000Z",
      };
      const prop = Property.fromJson(json);
      expect(prop.id).toBe("prop-1");
      expect(prop.bookId).toBe("book-1");
      expect(prop.name).toBe("Section Types");
      expect(prop.type).toBe("section-type");
      expect(prop.options).toEqual(["Chapter", "Scene"]);
    });

    it("should parse string options", () => {
      const json = {
        name: "Test",
        options: '["A","B","C"]',
      };
      const prop = Property.fromJson(json);
      expect(prop.options).toEqual(["A", "B", "C"]);
    });

    it("should handle invalid JSON string options gracefully", () => {
      const json = {
        name: "Test",
        options: "{invalid json}",
      };
      const prop = Property.fromJson(json);
      expect(prop.options).toEqual([]);
    });
  });

  describe("toJson", () => {
    it("should stringify options", () => {
      const prop = new Property();
      prop.bookId = "book-1";
      prop.name = "Test";
      prop.options = ["A", "B"];
      const json = prop.toJson();
      expect(typeof json.options).toBe("string");
      expect(json.options).toBe('["A","B"]');
    });
  });

  describe("toTransportJson", () => {
    it("should keep options as array", () => {
      const prop = new Property();
      prop.bookId = "book-1";
      prop.name = "Test";
      prop.options = ["A", "B"];
      const transport = prop.toTransportJson();
      expect(Array.isArray(transport.options)).toBe(true);
      expect(transport.options).toEqual(["A", "B"]);
    });
  });
});
