import { EventEmitter } from "events";

type Listener = () => void;

function Once(target: unknown, event: string, listener: Listener): boolean {
  const candidate = target as {
    once?: (name: string, fn: Listener) => unknown;
  };
  if (!candidate || typeof candidate.once !== "function") {
    return false;
  }
  candidate.once(event, listener);
  return true;
}

function Off(target: unknown, event: string, listener: Listener): void {
  const candidate = target as {
    removeListener?: (name: string, fn: Listener) => unknown;
  };
  if (candidate && typeof candidate.removeListener === "function") {
    candidate.removeListener(event, listener);
  }
}

/**
 * Release a slot once the streamed response is over: on stream close/error and
 * on reply/response finish/close. Listeners are one-shot and the release is
 * idempotent so double events cannot release the slot twice.
 */
export function AttachReleaseOnCompletion(
  stream: EventEmitter,
  reply: unknown,
  release: () => void,
): void {
  const targets: unknown[] = [stream, reply];
  const raw = (reply as { raw?: unknown })?.raw;
  if (raw && typeof (raw as { once?: unknown }).once === "function") {
    targets.push(raw);
  }

  let done = false;
  const complete = () => {
    if (done) {
      return;
    }
    done = true;
    for (const target of targets) {
      for (const event of ["close", "error", "finish"]) {
        Off(target, event, complete);
      }
    }
    release();
  };

  for (const target of targets) {
    for (const event of ["close", "error", "finish"]) {
      Once(target, event, complete);
    }
  }
}
