import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSectionsStore } from "../stores/sections";

function seedSections(store) {
  store.sections = [
    {
      id: "s1",
      bookId: "b1",
      parentId: null,
      type: "container",
      title: "Root",
      content: "",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
    },
    {
      id: "s2",
      bookId: "b1",
      parentId: "s1",
      type: "text",
      title: "Chapter 1",
      content: "one two three",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
    },
    {
      id: "s3",
      bookId: "b1",
      parentId: "s1",
      type: "text",
      title: "Chapter 2",
      content: "four five",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 1,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
    },
  ];
}

describe("sections store — live word counts", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("counts words from stored section content", () => {
    const store = useSectionsStore();
    seedSections(store);
    expect(store.bookWordCount).toBe(5);
  });

  it("prefers live (unsaved) content per section", () => {
    const store = useSectionsStore();
    seedSections(store);
    store.setLiveContent("s2", "one two three four five six");
    expect(store.bookWordCount).toBe(8);
  });

  it("live content of one section does not affect the others", () => {
    const store = useSectionsStore();
    seedSections(store);
    store.setLiveContent("s2", "x");
    store.setLiveContent("s3", "y");
    expect(store.bookWordCount).toBe(2);
  });

  it("removing a section drops its stored content and live override", () => {
    const store = useSectionsStore();
    seedSections(store);
    store.setLiveContent("s3", "brand new words");
    store.sections = store.sections.filter((s) => s.id !== "s3");
    delete store.liveContent.s3;
    expect(store.bookWordCount).toBe(3);
  });

  it("counts an empty book as zero", () => {
    const store = useSectionsStore();
    expect(store.bookWordCount).toBe(0);
  });
});
