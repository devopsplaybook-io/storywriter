import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { SafeJoin, IsSafePathSegment } from "../utils/SafePath";

export function BookMediaDir(config: Config, bookId: string): string {
  return SafeJoin(config.DATA_DIR, "media", bookId);
}

function BookAnalysisCachePath(config: Config, bookId: string): string {
  return SafeJoin(config.DATA_DIR, `book-analysis-${bookId}.json`);
}

/**
 * Remove every on-disk artifact of a book: the media directory (current media
 * and version media) and the analysis cache file. Logs and keeps going on
 * individual failures — the database is the source of truth and has already
 * been updated when this runs.
 */
export async function DeleteBookStorage(
  bookId: string,
  config: Config,
): Promise<void> {
  if (!IsSafePathSegment(bookId)) {
    return;
  }
  try {
    await fs.remove(BookMediaDir(config, bookId));
  } catch (err) {
    console.error(
      `[BookFiles] Failed to remove media dir for book ${bookId}: ${(err as Error).message}`,
    );
  }
  try {
    await fs.remove(BookAnalysisCachePath(config, bookId));
  } catch (err) {
    console.error(
      `[BookFiles] Failed to remove analysis cache for book ${bookId}: ${(err as Error).message}`,
    );
  }
}

/**
 * Remove `<bookId>/media` subdirectories whose media id is not in `keepIds`
 * (the `versions` directory is always kept). Used after a version restore to
 * clean up orphaned media directories.
 */
export async function RemoveMediaDirsNotIn(
  config: Config,
  bookId: string,
  keepIds: string[],
): Promise<void> {
  const mediaDir = BookMediaDir(config, bookId);
  let entries: string[];
  try {
    entries = await fs.readdir(mediaDir);
  } catch {
    return;
  }
  const keep = new Set(keepIds);
  for (const entry of entries) {
    if (entry === "versions") {
      continue;
    }
    if (keep.has(entry) || !IsSafePathSegment(entry)) {
      continue;
    }
    try {
      await fs.remove(path.join(mediaDir, entry));
    } catch (err) {
      console.error(
        `[BookFiles] Failed to remove orphan media dir ${entry} for book ${bookId}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Place `src` at `dest` replacing any existing file: hard-link when possible,
 * fall back to copying. Both paths must already be validated by the caller.
 */
export async function LinkOrCopyFile(src: string, dest: string): Promise<void> {
  try {
    await fs.unlink(dest);
  } catch {
    // Destination does not exist — fine.
  }
  try {
    await fs.link(src, dest);
  } catch {
    await fs.copy(src, dest);
  }
}
