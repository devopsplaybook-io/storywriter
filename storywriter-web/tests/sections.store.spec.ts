import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSectionsStore } from "../stores/sections";

vi.mock("../utils/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../utils/api";

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

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

describe("sections store — AI analysis", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.post.mockReset();
  });

  it("analyzeSection posts and replaces the section in state", async () => {
    const store = useSectionsStore();
    seedSections(store);
    const updated = {
      ...store.sections[1],
      analysis: "AI notes for chapter 1",
      dateUpdated: "2026-10-17T00:00:00.000Z",
    };
    mockedApi.post.mockResolvedValueOnce({ data: updated });

    const result = await store.analyzeSection("s2");

    expect(mockedApi.post).toHaveBeenCalledWith("/sections/s2/analysis");
    expect(result.analysis).toBe("AI notes for chapter 1");
    expect(store.sections[1].analysis).toBe("AI notes for chapter 1");
    expect(store.sections[0].analysis).toBe("");
  });

  it("analyzeSection updates currentSection when it is the analyzed one", async () => {
    const store = useSectionsStore();
    seedSections(store);
    store.currentSection = store.sections[2];
    const updated = {
      ...store.sections[2],
      analysis: "AI notes for chapter 2",
    };
    mockedApi.post.mockResolvedValueOnce({ data: updated });

    await store.analyzeSection("s3");

    expect(store.currentSection.analysis).toBe("AI notes for chapter 2");
  });

  it("runAiAction posts the action and returns the text", async () => {
    const store = useSectionsStore();
    seedSections(store);
    mockedApi.post.mockResolvedValueOnce({ data: { text: "Continued prose." } });

    const text = await store.runAiAction("s2", "continue");

    expect(mockedApi.post).toHaveBeenCalledWith("/sections/s2/ai-action", {
      action: "continue",
      selection: undefined,
    });
    expect(text).toBe("Continued prose.");
  });

  it("runAiAction forwards the selection for improve", async () => {
    const store = useSectionsStore();
    seedSections(store);
    mockedApi.post.mockResolvedValueOnce({ data: { text: "Improved." } });

    await store.runAiAction("s2", "improve", "one two");

    expect(mockedApi.post).toHaveBeenCalledWith("/sections/s2/ai-action", {
      action: "improve",
      selection: "one two",
    });
  });
});
