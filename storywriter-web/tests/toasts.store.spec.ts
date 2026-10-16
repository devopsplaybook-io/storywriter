import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useToastsStore } from "../stores/toasts";

describe("toasts store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues error and success toasts", () => {
    const store = useToastsStore();
    store.error("boom");
    store.success("done");
    expect(store.toasts).toHaveLength(2);
    expect(store.toasts[0].kind).toBe("error");
    expect(store.toasts[0].message).toBe("boom");
    expect(store.toasts[1].kind).toBe("success");
    expect(store.toasts[1].message).toBe("done");
  });

  it("auto-expires success toasts after ~5s", () => {
    const store = useToastsStore();
    const id = store.success("saved");
    vi.advanceTimersByTime(4999);
    expect(store.toasts.some((t) => t.id === id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toasts.some((t) => t.id === id)).toBe(false);
  });

  it("keeps error toasts longer than success toasts", () => {
    const store = useToastsStore();
    const id = store.error("boom");
    vi.advanceTimersByTime(5000);
    expect(store.toasts.some((t) => t.id === id)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(store.toasts.some((t) => t.id === id)).toBe(false);
  });

  it("caps the stack at 4 and drops the oldest", () => {
    const store = useToastsStore();
    for (let i = 0; i < 6; i++) {
      store.error(`toast ${i}`);
    }
    expect(store.toasts).toHaveLength(4);
    expect(store.toasts[0].message).toBe("toast 2");
    expect(store.toasts[3].message).toBe("toast 5");
  });

  it("dismiss removes a toast by id", () => {
    const store = useToastsStore();
    const id = store.error("boom");
    store.dismiss(id);
    expect(store.toasts).toHaveLength(0);
  });
});
