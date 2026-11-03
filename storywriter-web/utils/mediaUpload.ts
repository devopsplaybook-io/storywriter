// Client-side mirror of the server-side media limits, so oversized or
// unsupported uploads fail immediately with a clear message. The server
// remains authoritative.

export const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

export interface MediaFileLike {
  name: string;
  size: number;
  type: string;
}

export function validateMediaFile(file: MediaFileLike): string | null {
  if (file.size > MAX_MEDIA_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large: ${file.name} (${sizeMb} MB, maximum 10 MB)`;
  }
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
    return `Invalid file type: ${file.name}`;
  }
  return null;
}
