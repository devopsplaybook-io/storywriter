import * as path from "path";

/**
 * Single source of truth for path-segment safety. Every filesystem path built
 * from stored or archive-provided identifiers must go through SafeJoin so a
 * hostile name (`../..`, absolute paths, backslashes, NUL bytes) can never
 * escape the intended root directory.
 */

export class UnsafePathError extends Error {
  constructor(segment: string) {
    super(`Unsafe path segment: ${JSON.stringify(segment)}`);
    this.name = "UnsafePathError";
  }
}

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

export function IsSafePathSegment(segment: unknown): boolean {
  if (typeof segment !== "string") {
    return false;
  }
  if (!SAFE_SEGMENT_PATTERN.test(segment)) {
    return false;
  }
  if (segment === "." || segment === "..") {
    return false;
  }
  if (segment.startsWith(".") || segment.endsWith(".")) {
    return false;
  }
  return true;
}

/**
 * Join `segments` under `root`, rejecting any segment that is not a safe
 * single path component and verifying the resolved target stays inside the
 * resolved root.
 */
export function SafeJoin(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    if (!IsSafePathSegment(segment)) {
      throw new UnsafePathError(segment);
    }
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new UnsafePathError(segments.join("/"));
  }
  return target;
}
