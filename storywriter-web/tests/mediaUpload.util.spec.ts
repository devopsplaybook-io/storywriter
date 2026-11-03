import { describe, expect, it } from "vitest";
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_FILE_BYTES,
  validateMediaFile,
} from "../utils/mediaUpload";

function file(overrides: Partial<{ name: string; size: number; type: string }>) {
  return {
    name: "image.png",
    size: 1024,
    type: "image/png",
    ...overrides,
  };
}

describe("validateMediaFile", () => {
  it("accepts every allowed mime type under the size limit", () => {
    for (const type of ALLOWED_MEDIA_MIME_TYPES) {
      expect(validateMediaFile(file({ type }))).toBeNull();
    }
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validateMediaFile(file({ size: MAX_MEDIA_FILE_BYTES }))).toBeNull();
  });

  it("rejects oversized files", () => {
    const message = validateMediaFile(file({ size: MAX_MEDIA_FILE_BYTES + 1 }));
    expect(message).toContain("File is too large");
    expect(message).toContain("maximum 10 MB");
  });

  it("rejects unsupported types", () => {
    expect(validateMediaFile(file({ type: "application/pdf" }))).toBe(
      "Invalid file type: image.png",
    );
  });

  it("checks the size before the type", () => {
    const message = validateMediaFile(
      file({ type: "application/pdf", size: MAX_MEDIA_FILE_BYTES + 1 }),
    );
    expect(message).toContain("File is too large");
  });
});
