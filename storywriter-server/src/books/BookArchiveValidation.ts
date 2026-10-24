/**
 * Pure (no DB/fs) validation of import archives: entry allow-list, size and
 * count limits, and schema checks for every JSON file. All failures throw
 * ImportValidationError, which the import route maps to HTTP 400.
 */
import { IsSafePathSegment } from "../utils/SafePath";
import { IsAllowedMimeType } from "../media/MediaValidation";

export const IMPORT_LIMITS = {
  MAX_ENTRIES: 5000,
  MAX_TOTAL_UNCOMPRESSED: 200 * 1024 * 1024,
  MAX_MEDIA_FILE: 10 * 1024 * 1024,
  MAX_JSON_FILE: 20 * 1024 * 1024,
  MAX_GZIP_RATIO: 200,
};

export const SUPPORTED_ARCHIVE_VERSIONS = ["1.0", "2.0"];

// Required and optional JSON files; the two legacy version files are
// tolerated on import but ignored (the tables were dropped in init-0002).
export const ARCHIVE_JSON_FILES = [
  "manifest.json",
  "book.json",
  "sections.json",
  "attributes.json",
  "properties.json",
  "section-properties.json",
  "media-metadata.json",
] as const;

export const TOLERATED_ARCHIVE_JSON_FILES = [
  "section-versions.json",
  "attribute-versions.json",
] as const;

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export interface ArchiveEntryInfo {
  path: string;
  size: number;
  type: string;
}

function AssertString(
  value: unknown,
  field: string,
  maxLength?: number,
): string {
  if (typeof value !== "string") {
    throw new ImportValidationError(`Invalid archive: ${field} must be a string`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ImportValidationError(
      `Invalid archive: ${field} exceeds ${maxLength} characters`,
    );
  }
  return value;
}

function AssertNonEmptyString(
  value: unknown,
  field: string,
  maxLength?: number,
): string {
  const str = AssertString(value, field, maxLength);
  if (!str) {
    throw new ImportValidationError(`Invalid archive: ${field} must not be empty`);
  }
  return str;
}

/**
 * Validate the tar entry listing. Returns the set of entry paths that may be
 * extracted (all validated file entries), and enforces entry count, size and
 * gzip-ratio limits.
 */
export function ValidateArchiveEntries(
  entries: ArchiveEntryInfo[],
  compressedSize: number,
): Set<string> {
  if (entries.length > IMPORT_LIMITS.MAX_ENTRIES) {
    throw new ImportValidationError(
      `Invalid archive: too many entries (${entries.length} > ${IMPORT_LIMITS.MAX_ENTRIES})`,
    );
  }

  const allowed = new Set<string>();
  const seen = new Set<string>();
  let totalSize = 0;
  const mediaFileEntries = new Map<string, number>();

  for (const entry of entries) {
    const entryPath = entry.path;
    if (typeof entryPath !== "string" || seen.has(entryPath)) {
      throw new ImportValidationError(
        `Invalid archive: duplicate or invalid entry path ${JSON.stringify(entryPath)}`,
      );
    }
    seen.add(entryPath);

    if (entryPath.includes("\0")) {
      throw new ImportValidationError("Invalid archive: NUL byte in entry path");
    }
    if (entryPath.includes("\\")) {
      throw new ImportValidationError(
        `Invalid archive: backslash in entry path ${JSON.stringify(entryPath)}`,
      );
    }
    if (entryPath.startsWith("/")) {
      throw new ImportValidationError(
        `Invalid archive: absolute entry path ${JSON.stringify(entryPath)}`,
      );
    }
    const segments = entryPath.split("/").filter((s) => s !== "");
    if (segments.some((s) => s === ".." || s === ".")) {
      throw new ImportValidationError(
        `Invalid archive: path traversal in entry path ${JSON.stringify(entryPath)}`,
      );
    }

    if (entry.type === "SymbolicLink" || entry.type === "Link") {
      throw new ImportValidationError(
        `Invalid archive: link entries are not allowed (${entryPath})`,
      );
    }

    if (entry.type === "Directory") {
      // Only directory entries for the root, the media dir and per-media dirs.
      const isAllowedDir =
        segments.length === 0 ||
        (segments.length === 1 && segments[0] === "media") ||
        (segments.length === 2 &&
          segments[0] === "media" &&
          IsSafePathSegment(segments[1]));
      if (!isAllowedDir) {
        throw new ImportValidationError(
          `Invalid archive: unexpected directory entry ${JSON.stringify(entryPath)}`,
        );
      }
      continue;
    }

    if (entry.type !== "File") {
      throw new ImportValidationError(
        `Invalid archive: unsupported entry type for ${JSON.stringify(entryPath)}`,
      );
    }

    if (typeof entry.size !== "number" || entry.size < 0) {
      throw new ImportValidationError(
        `Invalid archive: invalid size for entry ${JSON.stringify(entryPath)}`,
      );
    }
    totalSize += entry.size;

    const isJson =
      (ARCHIVE_JSON_FILES as readonly string[]).includes(entryPath) ||
      (TOLERATED_ARCHIVE_JSON_FILES as readonly string[]).includes(entryPath);
    const mediaMatch = /^media\/([^/]+)\/([^/]+)$/.exec(entryPath);
    if (isJson) {
      if (entry.size > IMPORT_LIMITS.MAX_JSON_FILE) {
        throw new ImportValidationError(
          `Invalid archive: ${entryPath} exceeds ${IMPORT_LIMITS.MAX_JSON_FILE} bytes`,
        );
      }
      allowed.add(entryPath);
    } else if (mediaMatch && IsSafePathSegment(mediaMatch[1]) && IsSafePathSegment(mediaMatch[2])) {
      if (entry.size > IMPORT_LIMITS.MAX_MEDIA_FILE) {
        throw new ImportValidationError(
          `Invalid archive: media file ${entryPath} exceeds ${IMPORT_LIMITS.MAX_MEDIA_FILE} bytes`,
        );
      }
      mediaFileEntries.set(entryPath, entry.size);
      allowed.add(entryPath);
    } else {
      throw new ImportValidationError(
        `Invalid archive: unexpected entry ${JSON.stringify(entryPath)}`,
      );
    }
  }

  if (totalSize > IMPORT_LIMITS.MAX_TOTAL_UNCOMPRESSED) {
    throw new ImportValidationError(
      `Invalid archive: uncompressed size exceeds ${IMPORT_LIMITS.MAX_TOTAL_UNCOMPRESSED} bytes`,
    );
  }
  const effectiveCompressed = Math.max(compressedSize, 1024);
  if (totalSize / effectiveCompressed > IMPORT_LIMITS.MAX_GZIP_RATIO) {
    throw new ImportValidationError(
      "Invalid archive: decompression ratio exceeds the allowed limit",
    );
  }

  return allowed;
}

export function ValidateManifest(manifest: unknown): void {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new ImportValidationError("Invalid archive: manifest.json must be an object");
  }
  const version = (manifest as Record<string, unknown>).version;
  if (!SUPPORTED_ARCHIVE_VERSIONS.includes(version as string)) {
    throw new ImportValidationError(
      `Unsupported export version: ${JSON.stringify(version)}. Supported versions: ${SUPPORTED_ARCHIVE_VERSIONS.join(", ")}`,
    );
  }
}

export function ValidateBook(book: unknown): void {
  if (typeof book !== "object" || book === null || Array.isArray(book)) {
    throw new ImportValidationError("Invalid archive: book.json must be an object");
  }
  const data = book as Record<string, unknown>;
  AssertNonEmptyString(data.name, "book.name", 200);
  AssertString(data.description ?? "", "book.description", 20000);
  if (data.writingGoal !== undefined && data.writingGoal !== null) {
    const goal = Number(data.writingGoal);
    if (!Number.isFinite(goal) || !Number.isInteger(goal) || goal < 0) {
      throw new ImportValidationError(
        "Invalid archive: book.writingGoal must be a non-negative integer",
      );
    }
  }
}

export function ValidateAttributes(attributes: unknown): void {
  if (!Array.isArray(attributes)) {
    throw new ImportValidationError(
      "Invalid archive: attributes.json must be an array",
    );
  }
  for (const attr of attributes) {
    if (typeof attr !== "object" || attr === null) {
      throw new ImportValidationError("Invalid archive: attribute must be an object");
    }
    AssertNonEmptyString((attr as Record<string, unknown>).id, "attribute.id", 50);
    AssertString(
      (attr as Record<string, unknown>).title ?? "",
      "attribute.title",
      500,
    );
    AssertString(
      (attr as Record<string, unknown>).content ?? "",
      "attribute.content",
      1000000,
    );
  }
}

export function ValidateProperties(properties: unknown): void {
  if (!Array.isArray(properties)) {
    throw new ImportValidationError(
      "Invalid archive: properties.json must be an array",
    );
  }
  for (const prop of properties) {
    if (typeof prop !== "object" || prop === null) {
      throw new ImportValidationError("Invalid archive: property must be an object");
    }
    const data = prop as Record<string, unknown>;
    AssertNonEmptyString(data.id, "property.id", 50);
    AssertNonEmptyString(data.name, "property.name", 200);
    if (data.options !== undefined && data.options !== null) {
      // Options may be a JSON-encoded string (Property.toJson) or an array.
      let options: unknown = data.options;
      if (typeof options === "string") {
        try {
          options = JSON.parse(options);
        } catch {
          throw new ImportValidationError(
            "Invalid archive: property.options is not valid JSON",
          );
        }
      }
      if (
        !Array.isArray(options) ||
        options.some((o) => typeof o !== "string")
      ) {
        throw new ImportValidationError(
          "Invalid archive: property.options must be an array of strings",
        );
      }
    }
  }
}

export function ValidateMediaMetadata(mediaMetadata: unknown): void {
  if (!Array.isArray(mediaMetadata)) {
    throw new ImportValidationError(
      "Invalid archive: media-metadata.json must be an array",
    );
  }
  const seenIds = new Set<string>();
  for (const media of mediaMetadata) {
    if (typeof media !== "object" || media === null) {
      throw new ImportValidationError("Invalid archive: media must be an object");
    }
    const data = media as Record<string, unknown>;
    const id = AssertNonEmptyString(data.id, "media.id", 50);
    if (seenIds.has(id)) {
      throw new ImportValidationError(`Invalid archive: duplicate media id ${id}`);
    }
    seenIds.add(id);
    AssertString(data.slug ?? "", "media.slug", 200);
    const filename = AssertNonEmptyString(data.filename, "media.filename", 200);
    if (!IsSafePathSegment(filename)) {
      throw new ImportValidationError(
        `Invalid archive: unsafe media filename ${JSON.stringify(filename)}`,
      );
    }
    if (!IsAllowedMimeType(data.mimeType)) {
      throw new ImportValidationError(
        `Invalid archive: media MIME type ${JSON.stringify(data.mimeType)} is not allowed`,
      );
    }
    if (typeof data.size !== "number" || !Number.isFinite(data.size) || data.size < 0) {
      throw new ImportValidationError(
        "Invalid archive: media.size must be a non-negative number",
      );
    }
  }
}

/**
 * Validate section records and return them in parent-first insertion order.
 */
export function ValidateSections(
  sections: unknown,
  mediaIds: Set<string>,
): Record<string, unknown>[] {
  if (!Array.isArray(sections)) {
    throw new ImportValidationError("Invalid archive: sections.json must be an array");
  }
  if (sections.length === 0) {
    throw new ImportValidationError("Invalid archive: no sections found");
  }

  const byId = new Map<string, Record<string, unknown>>();
  let roots = 0;
  for (const section of sections) {
    if (typeof section !== "object" || section === null) {
      throw new ImportValidationError("Invalid archive: section must be an object");
    }
    const data = section as Record<string, unknown>;
    const id = AssertNonEmptyString(data.id, "section.id", 50);
    if (byId.has(id)) {
      throw new ImportValidationError(`Invalid archive: duplicate section id ${id}`);
    }
    byId.set(id, data);

    if (data.parentId !== null && data.parentId !== undefined) {
      if (typeof data.parentId !== "string" || !data.parentId) {
        throw new ImportValidationError(
          `Invalid archive: section ${id} has an invalid parentId`,
        );
      }
    } else {
      roots++;
      if (roots > 1) {
        throw new ImportValidationError(
          "Invalid archive: sections must have exactly one root",
        );
      }
    }

    const type = data.type ?? "text";
    if (!["text", "container", "media"].includes(type as string)) {
      throw new ImportValidationError(
        `Invalid archive: section ${id} has an unknown type ${JSON.stringify(type)}`,
      );
    }
    AssertString(data.title ?? "", `section ${id} title`, 500);
    AssertString(data.content ?? "", `section ${id} content`, 5000000);
    AssertString(data.analysis ?? "", `section ${id} analysis`, 1000000);
    AssertString(data.caption ?? "", `section ${id} caption`, 5000);
    const orderIndex = data.orderIndex ?? 0;
    if (
      typeof orderIndex !== "number" ||
      !Number.isFinite(orderIndex) ||
      orderIndex < 0
    ) {
      throw new ImportValidationError(
        `Invalid archive: section ${id} has an invalid orderIndex`,
      );
    }
    if (data.mediaId !== null && data.mediaId !== undefined) {
      const mediaId = AssertString(data.mediaId, `section ${id} mediaId`, 50);
      if (!mediaIds.has(mediaId)) {
        throw new ImportValidationError(
          `Invalid archive: section ${id} references unknown media ${mediaId}`,
        );
      }
    }
  }

  if (roots === 0) {
    throw new ImportValidationError(
      "Invalid archive: sections must have exactly one root",
    );
  }

  for (const data of byId.values()) {
    const parentId = data.parentId as string | null | undefined;
    if (parentId && !byId.has(parentId)) {
      throw new ImportValidationError(
        `Invalid archive: section ${data.id} references unknown parent ${parentId}`,
      );
    }
  }

  // Cycle detection: walk every node towards the root.
  for (const data of byId.values()) {
    const visited = new Set<string>();
    let current: Record<string, unknown> | undefined = data;
    while (current && current.parentId) {
      const id = current.id as string;
      if (visited.has(id)) {
        throw new ImportValidationError(
          `Invalid archive: section parent cycle detected at ${id}`,
        );
      }
      visited.add(id);
      current = byId.get(current.parentId as string);
    }
  }

  // Parent-first insertion order.
  const ordered: Record<string, unknown>[] = [];
  const inserted = new Set<string>();
  const pending = [...byId.values()];
  while (pending.length > 0) {
    let progressed = false;
    for (let i = 0; i < pending.length; i++) {
      const parentId = pending[i].parentId as string | null | undefined;
      if (!parentId || inserted.has(parentId)) {
        ordered.push(pending[i]);
        inserted.add(pending[i].id as string);
        pending.splice(i, 1);
        i--;
        progressed = true;
      }
    }
    if (!progressed) {
      throw new ImportValidationError(
        "Invalid archive: section parent cycle detected",
      );
    }
  }
  return ordered;
}

export function ValidateSectionProperties(
  sectionProperties: unknown,
  sectionIds: Set<string>,
  propertyIds: Set<string>,
): void {
  if (!Array.isArray(sectionProperties)) {
    throw new ImportValidationError(
      "Invalid archive: section-properties.json must be an array",
    );
  }
  for (const sp of sectionProperties) {
    if (typeof sp !== "object" || sp === null) {
      throw new ImportValidationError(
        "Invalid archive: section property value must be an object",
      );
    }
    const data = sp as Record<string, unknown>;
    const sectionId = AssertNonEmptyString(data.sectionId, "sectionId", 50);
    const propertyId = AssertNonEmptyString(data.propertyId, "propertyId", 50);
    AssertString(data.value ?? "", "section property value", 100000);
    if (!sectionIds.has(sectionId)) {
      throw new ImportValidationError(
        `Invalid archive: section property references unknown section ${sectionId}`,
      );
    }
    if (!propertyIds.has(propertyId)) {
      throw new ImportValidationError(
        `Invalid archive: section property references unknown property ${propertyId}`,
      );
    }
  }
}

/**
 * Cross-check declared media metadata against the archive's media entries:
 * every declared media needs exactly one matching file with the declared
 * size, and there may be no orphan media entries.
 */
export function ValidateMediaFiles(
  fileEntries: Map<string, number>,
  mediaMetadata: Record<string, unknown>[],
): void {
  const declared = new Set<string>();
  for (const media of mediaMetadata) {
    const id = media.id as string;
    const filename = media.filename as string;
    const entryPath = `media/${id}/${filename}`;
    declared.add(entryPath);
    const actualSize = fileEntries.get(entryPath);
    if (actualSize === undefined) {
      throw new ImportValidationError(
        `Invalid archive: media file missing from archive: ${entryPath}`,
      );
    }
    if (actualSize !== media.size) {
      throw new ImportValidationError(
        `Invalid archive: media file size mismatch for ${entryPath}`,
      );
    }
  }
  for (const entryPath of fileEntries.keys()) {
    if (!declared.has(entryPath)) {
      throw new ImportValidationError(
        `Invalid archive: unexpected media file in archive: ${entryPath}`,
      );
    }
  }
}
