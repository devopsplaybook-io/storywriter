import { Config } from "../Config";
import { ConcurrencyAcquire, ConcurrencyRelease, RateLimitCheck } from "./RateLimit";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LlmLimitKind = "concurrency" | "quota";

/**
 * Acquire an LLM request slot for a user: bounded per-user concurrency and a
 * rolling daily quota. Returns "ok" when the slot is held; the caller must
 * release it with LlmRequestRelease (even on errors).
 */
export function LlmRequestAcquire(
  userId: string,
  config: Config,
): LlmLimitKind | "ok" {
  if (!ConcurrencyAcquire(`llm:${userId}`, config.LLM_USER_CONCURRENCY)) {
    return "concurrency";
  }
  const quota = RateLimitCheck(
    `llm-quota:${userId}`,
    config.LLM_DAILY_QUOTA,
    DAY_MS,
  );
  if (!quota.allowed) {
    ConcurrencyRelease(`llm:${userId}`);
    return "quota";
  }
  return "ok";
}

export function LlmRequestRelease(userId: string): void {
  ConcurrencyRelease(`llm:${userId}`);
}

export function LlmLimitMessage(kind: LlmLimitKind): string {
  return kind === "concurrency"
    ? "Another AI request is already running"
    : "Daily AI request quota exceeded";
}

/**
 * Acquire an import/export slot for a user. Returns true when the slot is
 * held; the caller must release it with ImportExportRelease.
 */
export function ImportExportAcquire(
  userId: string,
  config: Config,
): boolean {
  return ConcurrencyAcquire(
    `import-export:${userId}`,
    config.IMPORT_EXPORT_CONCURRENCY,
  );
}

export function ImportExportRelease(userId: string): void {
  ConcurrencyRelease(`import-export:${userId}`);
}
