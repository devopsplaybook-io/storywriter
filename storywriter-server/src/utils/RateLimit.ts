// Dependency-free in-process rate limiting helpers: a fixed-window counter
// and a counting semaphore. Deterministic on Date.now so tests can use fake
// timers. State lives in process memory, which matches the single-instance
// all-in-one deployment.

interface RateLimitWindow {
  windowStart: number;
  count: number;
}

const windows = new Map<string, RateLimitWindow>();
const activeCounts = new Map<string, number>();

// Sweep trigger: the map is scanned for expired windows once it grows past
// this many keys, so abandoned keys never accumulate unboundedly.
const SWEEP_THRESHOLD = 1024;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends (only set when not allowed). */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter: allows at most `max` calls per `windowMs` per key.
 * The window starts at the first call and resets once it has elapsed.
 */
export function RateLimitCheck(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  SweepExpiredWindows(now, windowMs);
  const entry = windows.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    windows.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count < max) {
    entry.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: false, retryAfterSeconds: RetryAfter(entry, now, windowMs) };
}

/**
 * Read-only variant of {@link RateLimitCheck}: reports whether the key has
 * already reached `max` in the current window without consuming or creating an
 * entry. Used when only certain outcomes (e.g. failed logins) count.
 */
export function RateLimitPeek(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now - entry.windowStart >= windowMs || entry.count < max) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: false, retryAfterSeconds: RetryAfter(entry, now, windowMs) };
}

/**
 * Record one failure for the key: starts a window on the first failure and
 * increments the count within the current window. Windows reset after
 * `windowMs`, so the budget is a fixed window of failures rather than a
 * penalty that lasts forever.
 */
export function RateLimitRecordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  SweepExpiredWindows(now, windowMs);
  const entry = windows.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    windows.set(key, { windowStart: now, count: 1 });
    return;
  }
  entry.count++;
}

function RetryAfter(
  entry: RateLimitWindow,
  now: number,
  windowMs: number,
): number {
  return Math.max(
    1,
    Math.ceil((entry.windowStart + windowMs - now) / 1000),
  );
}

function SweepExpiredWindows(now: number, windowMs: number): void {
  if (windows.size <= SWEEP_THRESHOLD) {
    return;
  }
  for (const [entryKey, entry] of windows) {
    if (now - entry.windowStart >= windowMs) {
      windows.delete(entryKey);
    }
  }
}

/**
 * Counting semaphore: acquires one slot for `key` when fewer than `max`
 * holders are active. Releases must go through ConcurrencyRelease.
 */
export function ConcurrencyAcquire(key: string, max: number): boolean {
  const current = activeCounts.get(key) || 0;
  if (current >= max) {
    return false;
  }
  activeCounts.set(key, current + 1);
  return true;
}

export function ConcurrencyRelease(key: string): void {
  const current = activeCounts.get(key) || 0;
  if (current <= 1) {
    activeCounts.delete(key);
  } else {
    activeCounts.set(key, current - 1);
  }
}

export function ConcurrencyActive(key: string): number {
  return activeCounts.get(key) || 0;
}

/** Test helper: clears all rate-limit and concurrency state. */
export function RateLimitResetForTests(): void {
  windows.clear();
  activeCounts.clear();
}
