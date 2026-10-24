import {
  ALLOWED_MIME_TYPES,
  ExtensionForMimeType,
  GenerateMediaFilename,
  IsAllowedMimeType,
  MatchesMagicBytes,
  SanitizeOriginalFilename,
} from "./MediaValidation";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16),
]);
const GIF_BYTES = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(8),
]);
const SVG_TEXT = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`;
const SVG_PLAIN = `<svg xmlns="http://www.w3.org/2000/svg"/>`;
const HTML_TEXT = `<!DOCTYPE html><html><body>hi</body></html>`;

describe("MediaValidation", () => {
  describe("IsAllowedMimeType", () => {
    it("allows the image allow-list", () => {
      for (const mime of ALLOWED_MIME_TYPES) {
        expect(IsAllowedMimeType(mime)).toBe(true);
      }
    });

    it.each(["text/html", "image/svg", "application/pdf", "", null, 42])(
      "rejects %j",
      (mime) => {
        expect(IsAllowedMimeType(mime as unknown as string)).toBe(false);
      },
    );
  });

  describe("ExtensionForMimeType", () => {
    it("maps each allowed type", () => {
      expect(ExtensionForMimeType("image/jpeg")).toBe(".jpg");
      expect(ExtensionForMimeType("image/png")).toBe(".png");
      expect(ExtensionForMimeType("image/gif")).toBe(".gif");
      expect(ExtensionForMimeType("image/webp")).toBe(".webp");
      expect(ExtensionForMimeType("image/svg+xml")).toBe(".svg");
      expect(ExtensionForMimeType("text/html")).toBe("");
    });
  });

  describe("GenerateMediaFilename", () => {
    it("builds <id><ext>", () => {
      expect(GenerateMediaFilename("abc-123", "image/png")).toBe("abc-123.png");
    });

    it("throws for unknown MIME types", () => {
      expect(() => GenerateMediaFilename("abc-123", "text/html")).toThrow();
    });
  });

  describe("MatchesMagicBytes", () => {
    it("accepts valid raster images", () => {
      expect(MatchesMagicBytes(PNG_BYTES, "image/png")).toBe(true);
      expect(MatchesMagicBytes(JPEG_BYTES, "image/jpeg")).toBe(true);
      expect(MatchesMagicBytes(GIF_BYTES, "image/gif")).toBe(true);
      expect(MatchesMagicBytes(WEBP_BYTES, "image/webp")).toBe(true);
    });

    it("accepts SVG documents", () => {
      expect(MatchesMagicBytes(Buffer.from(SVG_TEXT), "image/svg+xml")).toBe(
        true,
      );
      expect(MatchesMagicBytes(Buffer.from(SVG_PLAIN), "image/svg+xml")).toBe(
        true,
      );
      expect(
        MatchesMagicBytes(Buffer.from(`\uFEFF ${SVG_PLAIN}`), "image/svg+xml"),
      ).toBe(true);
    });

    it("rejects content that does not match the declared type", () => {
      expect(MatchesMagicBytes(Buffer.from(HTML_TEXT), "image/png")).toBe(false);
      expect(MatchesMagicBytes(PNG_BYTES, "image/jpeg")).toBe(false);
      expect(MatchesMagicBytes(Buffer.from(HTML_TEXT), "image/svg+xml")).toBe(
        false,
      );
      expect(MatchesMagicBytes(Buffer.from("<script>"), "image/svg+xml")).toBe(
        false,
      );
      expect(MatchesMagicBytes(PNG_BYTES.subarray(0, 2), "image/png")).toBe(
        false,
      );
    });
  });

  describe("SanitizeOriginalFilename", () => {
    it("keeps the basename of hostile paths", () => {
      expect(SanitizeOriginalFilename("../../etc/passwd")).toBe("passwd");
      expect(SanitizeOriginalFilename("C:\\Users\\x\\pic.png")).toBe("pic.png");
      expect(SanitizeOriginalFilename("a/b/c.png")).toBe("c.png");
    });

    it("strips control characters and bounds the length", () => {
      expect(SanitizeOriginalFilename("a\0b\u0001c.png")).toBe("abc.png");
      expect(SanitizeOriginalFilename("x".repeat(500)).length).toBe(200);
    });

    it("returns empty for non-strings", () => {
      expect(SanitizeOriginalFilename(null)).toBe("");
      expect(SanitizeOriginalFilename(undefined)).toBe("");
      expect(SanitizeOriginalFilename(42 as unknown as string)).toBe("");
    });
  });
});
