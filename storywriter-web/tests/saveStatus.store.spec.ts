import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSaveStatusStore } from "../stores/saveStatus";

describe("saveStatus store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts idle and not dirty", () => {
    const store = useSaveStatusStore();
    expect(store.status).toBe("idle");
    expect(store.isDirty).toBe(false);
    expect(store.lastSavedAt).toBeNull();
    expect(store.errorMessage).toBeNull();
  });

  it("transitions unsaved → saving → saved", () => {
    const store = useSaveStatusStore();
    store.markUnsaved();
    expect(store.status).toBe("unsaved");
    expect(store.isDirty).toBe(true);
    store.markSaving();
    expect(store.status).toBe("saving");
    expect(store.isDirty).toBe(true);
    store.markSaved();
    expect(store.status).toBe("saved");
    expect(store.isDirty).toBe(false);
    expect(store.lastSavedAt).not.toBeNull();
  });

  it("captures the error message on failure and stays dirty", () => {
    const store = useSaveStatusStore();
    store.markSaving();
    store.markError("Section save failed");
    expect(store.status).toBe("error");
    expect(store.errorMessage).toBe("Section save failed");
    expect(store.isDirty).toBe(true);
  });

  it("clears the error message on the next save attempt", () => {
    const store = useSaveStatusStore();
    store.markError("boom");
    store.markUnsaved();
    expect(store.errorMessage).toBeNull();
  });

  it("markIdle returns to a clean state", () => {
    const store = useSaveStatusStore();
    store.markUnsaved();
    store.markIdle();
    expect(store.status).toBe("idle");
    expect(store.isDirty).toBe(false);
  });
});
