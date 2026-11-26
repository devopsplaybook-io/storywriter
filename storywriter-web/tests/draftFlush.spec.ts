import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSaveStatusStore } from "../stores/saveStatus";
import { flushPendingDrafts, registerDraftFlusher } from "../utils/draftFlush";

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe("draft flush registry", () => {
  it("calls registered flushers until they are unregistered", () => {
    const flusher = vi.fn();
    const unregister = registerDraftFlusher(flusher);

    flushPendingDrafts();
    expect(flusher).toHaveBeenCalledTimes(1);

    unregister();
    flushPendingDrafts();
    expect(flusher).toHaveBeenCalledTimes(1);
  });

  it("flushes when online even with unsaved changes", () => {
    const flusher = vi.fn();
    const unregister = registerDraftFlusher(flusher);
    useSaveStatusStore().markUnsaved();

    flushPendingDrafts();

    expect(flusher).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("vetoes the reload by throwing when offline with unsaved changes", () => {
    setOnline(false);
    const flusher = vi.fn();
    const unregister = registerDraftFlusher(flusher);
    useSaveStatusStore().markUnsaved();

    expect(() => flushPendingDrafts()).toThrow();
    expect(flusher).not.toHaveBeenCalled();
    unregister();
  });

  it("flushes when offline but nothing is unsaved", () => {
    setOnline(false);
    const flusher = vi.fn();
    const unregister = registerDraftFlusher(flusher);
    useSaveStatusStore().markSaved();

    flushPendingDrafts();

    expect(flusher).toHaveBeenCalledTimes(1);
    unregister();
  });
});
