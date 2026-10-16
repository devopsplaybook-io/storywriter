import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  hasNewerDraft,
  readDraft,
  writeDraft,
} from "../utils/drafts";

describe("drafts util", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips write/read/clear", () => {
    writeDraft("section", "s1", {
      title: "Chapter 1",
      content: "It was a dark night",
      savedAt: "2026-10-16T10:00:00.000Z",
    });
    expect(readDraft("section", "s1")).toEqual({
      title: "Chapter 1",
      content: "It was a dark night",
      savedAt: "2026-10-16T10:00:00.000Z",
    });
    clearDraft("section", "s1");
    expect(readDraft("section", "s1")).toBeNull();
  });

  it("keeps kinds and ids separate", () => {
    writeDraft("section", "s1", { savedAt: "2026-10-16T10:00:00.000Z" });
    writeDraft("attribute", "s1", { savedAt: "2026-10-16T11:00:00.000Z" });
    expect(readDraft("section", "s1")?.savedAt).toBe(
      "2026-10-16T10:00:00.000Z",
    );
    expect(readDraft("attribute", "s1")?.savedAt).toBe(
      "2026-10-16T11:00:00.000Z",
    );
  });

  it("hasNewerDraft is true when the draft is newer than the server state", () => {
    writeDraft("section", "s1", { savedAt: "2026-10-16T10:00:00.000Z" });
    expect(
      hasNewerDraft("section", "s1", "2026-10-16T09:59:00.000Z"),
    ).toBe(true);
    expect(
      hasNewerDraft("section", "s1", "2026-10-16T10:01:00.000Z"),
    ).toBe(false);
  });

  it("hasNewerDraft treats a valid draft as newer without a usable server date", () => {
    writeDraft("section", "s1", { savedAt: "2026-10-16T10:00:00.000Z" });
    expect(hasNewerDraft("section", "s1", undefined)).toBe(true);
    expect(hasNewerDraft("section", "s1", "not-a-date")).toBe(true);
    expect(hasNewerDraft("section", "s2", undefined)).toBe(false);
  });

  it("returns null and never throws on corrupt or invalid payloads", () => {
    localStorage.setItem("storywriter.draft.section.s1", "{not json");
    expect(readDraft("section", "s1")).toBeNull();

    localStorage.setItem("storywriter.draft.section.s1", "42");
    expect(readDraft("section", "s1")).toBeNull();

    localStorage.setItem(
      "storywriter.draft.section.s1",
      JSON.stringify({ title: "no savedAt" }),
    );
    expect(readDraft("section", "s1")).toBeNull();

    localStorage.setItem("storywriter.draft.section.s1", "{not json");
    expect(hasNewerDraft("section", "s1", "2026-10-16T10:00:00.000Z")).toBe(
      false,
    );
  });
});
