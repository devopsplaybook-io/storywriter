import { IsSafePathSegment, SafeJoin, UnsafePathError } from "./SafePath";

describe("SafePath", () => {
  describe("IsSafePathSegment", () => {
    it("accepts ordinary identifiers and legacy sanitized filenames", () => {
      expect(IsSafePathSegment("book-123")).toBe(true);
      expect(IsSafePathSegment("0c9f6a1e-2b3d-4e5f-8a9b-1c2d3e4f5a6b.png")).toBe(
        true,
      );
      expect(IsSafePathSegment("my_photo-01.jpg")).toBe(true);
      expect(IsSafePathSegment("file.name.webp")).toBe(true);
    });

    it.each([
      [".."],
      ["../x"],
      ["a/../b"],
      ["/etc/passwd"],
      ["a/b"],
      ["a\\b"],
      ["a\0b"],
      ["."],
      [".hidden"],
      ["file."],
      [""],
      [null],
      [42],
    ])("rejects %j", (segment) => {
      expect(IsSafePathSegment(segment as unknown as string)).toBe(false);
    });
  });

  describe("SafeJoin", () => {
    it("joins safe segments under the root", () => {
      expect(SafeJoin("/data/dir", "book-1", "media-2.png")).toBe(
        "/data/dir/book-1/media-2.png",
      );
    });

    it.each([
      [".."],
      ["../evil"],
      ["/etc/passwd"],
      ["a/b"],
      ["a\\b"],
      ["a\0b"],
      ["."],
      [".hidden"],
    ])("refuses to join unsafe segment %j", (segment) => {
      expect(() => SafeJoin("/data/dir", segment as string)).toThrow(
        UnsafePathError,
      );
    });

    it("refuses segments that resolve outside the root", () => {
      // A segment that passes validation cannot traverse, but the resolved
      // target is still verified to stay under the root.
      expect(() => SafeJoin("/data/dir", "..", "escape")).toThrow(
        UnsafePathError,
      );
    });
  });
});
