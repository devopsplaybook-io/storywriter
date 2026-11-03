import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSectionsStore } from "../stores/sections";
import { countBookWords } from "../utils/wordCount";

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
  delete: ReturnType<typeof vi.fn>;
};

function seedSections(store) {
  store.setSections([
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
      revision: 1,
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
      revision: 3,
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
      revision: 2,
    },
  ]);
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

  it("removing a section drops its stored content and live override", async () => {
    const store = useSectionsStore();
    seedSections(store);
    store.setLiveContent("s3", "brand new words");
    expect(store.bookWordCount).toBe(6);

    mockedApi.delete.mockResolvedValueOnce({ data: {} });
    await store.remove("s3");

    expect(store.bookWordCount).toBe(3);
    expect(store.liveContent.s3).toBeUndefined();
    expect(store.wordCounts.s3).toBeUndefined();
  });

  it("counts an empty book as zero", () => {
    const store = useSectionsStore();
    expect(store.bookWordCount).toBe(0);
  });
});

describe("sections store — incremental word counts match full recomputation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.get.mockReset();
  });

  function expectMatchesFullRecompute(store) {
    expect(store.bookWordCount).toBe(
      countBookWords(store.sections, store.liveContent),
    );
  }

  function seedFixtures(store) {
    store.setSections([
      {
        id: "root",
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
        revision: 1,
      },
      {
        id: "markdown",
        bookId: "b1",
        parentId: "root",
        type: "text",
        title: "Markdown",
        content:
          "# Title\n\nSome **bold** words and a [link](https://example.com).\n\n```js\nconst x = 1;\n```",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 0,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T00:00:00.000Z",
        revision: 1,
      },
      {
        id: "empty",
        bookId: "b1",
        parentId: "root",
        type: "text",
        title: "Empty",
        content: "",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 1,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T00:00:00.000Z",
        revision: 1,
      },
      {
        id: "media",
        bookId: "b1",
        parentId: "root",
        type: "media",
        title: "Picture",
        content: "",
        analysis: "",
        mediaId: "m1",
        caption: "A caption with words",
        orderIndex: 2,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T00:00:00.000Z",
        revision: 1,
      },
    ]);
  }

  it("matches full recomputation after seeding and live edits", () => {
    const store = useSectionsStore();
    seedFixtures(store);
    expectMatchesFullRecompute(store);

    for (const content of [
      "one two",
      "",
      "## Heading\n\nfinal **three** words",
      "- item one\n- item two",
    ]) {
      store.setLiveContent("markdown", content);
      expectMatchesFullRecompute(store);
    }
    store.setLiveContent("empty", "now not empty");
    expectMatchesFullRecompute(store);
  });

  it("matches full recomputation after create, update and remove", async () => {
    const store = useSectionsStore();
    seedFixtures(store);

    const created = {
      ...store.sections[1],
      id: "created",
      content: "brand new content",
      revision: 1,
    };
    mockedApi.post.mockResolvedValueOnce({ data: created });
    await store.create("b1", "root", "text", "Created");
    expectMatchesFullRecompute(store);

    const updated = {
      ...store.sections[1],
      content: "**replaced** content",
      revision: 2,
    };
    mockedApi.put.mockResolvedValueOnce({ data: updated });
    await store.update("markdown", { content: "**replaced** content" });
    expectMatchesFullRecompute(store);

    mockedApi.delete.mockResolvedValueOnce({ data: {} });
    await store.remove("created");
    expectMatchesFullRecompute(store);
  });
});

describe("sections store — bulk reorder", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.put.mockReset();
  });

  it("sends one request and applies the new indexes locally", async () => {
    const store = useSectionsStore();
    seedSections(store);
    mockedApi.put.mockResolvedValueOnce({ data: {} });

    await store.reorderBulk("s1", ["s3", "s2"]);

    expect(mockedApi.put).toHaveBeenCalledTimes(1);
    expect(mockedApi.put).toHaveBeenCalledWith("/sections/reorder", {
      parentId: "s1",
      sectionIds: ["s3", "s2"],
    });
    expect(store.sections.find((s) => s.id === "s3").orderIndex).toBe(0);
    expect(store.sections.find((s) => s.id === "s2").orderIndex).toBe(1);
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

describe("sections store — optimistic revision", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.put.mockReset();
  });

  it("update sends the stored revision for a known section", async () => {
    const store = useSectionsStore();
    seedSections(store);
    const updated = {
      ...store.sections[1],
      content: "one two three four",
      revision: 4,
      dateUpdated: "2026-10-17T00:00:00.000Z",
    };
    mockedApi.put.mockResolvedValueOnce({ data: updated });

    await store.update("s2", { content: "one two three four" });

    expect(mockedApi.put).toHaveBeenCalledWith("/sections/s2", {
      revision: 3,
      content: "one two three four",
    });
    expect(store.sections[1].revision).toBe(4);
    expect(store.sections[1].content).toBe("one two three four");
  });

  it("update omits revision when the section is unknown locally", async () => {
    const store = useSectionsStore();
    mockedApi.put.mockResolvedValueOnce({
      data: { id: "sx", revision: 1 },
    });

    await store.update("sx", { title: "Fresh" });

    expect(mockedApi.put).toHaveBeenCalledWith("/sections/sx", {
      title: "Fresh",
    });
  });

  it("update rejects and leaves state unchanged on a 409 conflict", async () => {
    const store = useSectionsStore();
    seedSections(store);
    mockedApi.put.mockRejectedValueOnce({
      response: { status: 409 },
    });

    await expect(store.update("s2", { content: "new" })).rejects.toBeDefined();

    expect(store.sections[1].content).toBe("one two three");
    expect(store.sections[1].revision).toBe(3);
  });

  it("update sends a structural type change with the stored revision", async () => {
    const store = useSectionsStore();
    seedSections(store);
    mockedApi.put.mockResolvedValueOnce({
      data: { ...store.sections[1], type: "media", revision: 4 },
    });

    await store.update("s2", { type: "media" });

    expect(mockedApi.put).toHaveBeenCalledWith("/sections/s2", {
      revision: 3,
      type: "media",
    });
    expect(store.sections[1].type).toBe("media");
  });
});
