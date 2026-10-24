/**
 * Shared media validation: MIME allow-list, extension mapping and magic-byte
 * checks used by uploads and by archive import so imported media obeys the
 * same rules as uploaded media.
 */

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const MAX_ORIGINAL_FILENAME_LENGTH = 200;

export function IsAllowedMimeType(mimeType: unknown): boolean {
  return (
    typeof mimeType === "string" &&
    (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
  );
}

export function ExtensionForMimeType(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] || "";
}

/**
 * Server-generated storage filename: `<mediaId><validated extension>`.
 * The display/original name is kept separately in `media.originalFilename`.
 */
export function GenerateMediaFilename(mediaId: string, mimeType: string): string {
  const ext = ExtensionForMimeType(mimeType);
  if (!ext) {
    throw new Error(`No extension for MIME type: ${mimeType}`);
  }
  return `${mediaId}${ext}`;
}

/** Check the leading magic bytes of a buffer against the declared MIME type. */
export function MatchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }
  switch (mimeType) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/gif":
      return buffer.subarray(0, 4).toString("latin1") === "GIF8";
    case "image/webp":
      return (
        buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
        buffer.length >= 12 &&
        buffer.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case "image/svg+xml": {
      const head = buffer
        .subarray(0, Math.min(buffer.length, 1024))
        .toString("utf8")
        .replace(/^\uFEFF/, "")
        .trimStart();
      return head.startsWith("<?xml") || head.startsWith("<svg");
    }
    default:
      return false;
  }
}

/**
 * Sanitize a user-provided display filename: strip any path components and
 * control characters, then bound the length. Never used as a filesystem path.
 */
export function SanitizeOriginalFilename(filename: unknown): string {
  if (typeof filename !== "string") {
    return "";
  }
  const base = filename.split(/[/\\]/).pop() || "";
  // Strip control characters (code points 0x00-0x1f and 0x7f).
  const cleaned = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned.substring(0, MAX_ORIGINAL_FILENAME_LENGTH);
}
