export interface SaveConflictRetryOptions {
  /** Perform the write (read it from the latest state on every attempt). */
  save: () => Promise<unknown>;
  /** Reload the server state so the next attempt sends the fresh revision. */
  refresh: () => Promise<void>;
  /** Extra attempts after the initial one (default: 2 → 3 attempts total). */
  retries?: number;
  onRetry?: (attempt: number) => void;
}

export function isConflictError(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } } | undefined)?.response
      ?.status === 409
  );
}

/**
 * Retry a save a bounded number of times after a 409. Each retry refreshes the
 * server state first, so the write is rebuilt with the current revision and no
 * user input is needed. Non-conflict errors are rethrown immediately.
 */
export async function saveWithConflictRetry({
  save,
  refresh,
  retries = 2,
  onRetry,
}: SaveConflictRetryOptions): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    try {
      return await save();
    } catch (error) {
      if (!isConflictError(error) || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      onRetry?.(attempt);
      await refresh();
    }
  }
}
