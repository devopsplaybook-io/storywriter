jest.mock("fs-extra", () => ({
  ...jest.requireActual("fs-extra"),
  pathExists: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn(),
  ensureDir: jest.fn(),
}));

const fsMock = jest.requireMock("fs-extra") as {
  pathExists: jest.Mock;
  readJson: jest.Mock;
  writeJson: jest.Mock;
  ensureDir: jest.Mock;
};

jest.mock("../books/BooksData", () => ({
  BooksDataGet: jest.fn(),
}));

jest.mock("../sections/SectionsData", () => ({
  SectionsDataListByBook: jest.fn(),
}));

jest.mock("../attributes/BookAttributesData", () => ({
  BookAttributesDataListByBook: jest.fn(),
}));

jest.mock("../properties/PropertiesData", () => ({
  PropertiesDataListByBook: jest.fn(),
  PropertiesDataGetAllSectionValuesForBook: jest.fn(),
}));

jest.mock("../media/MediaData", () => ({
  MediaDataList: jest.fn(),
}));

jest.mock("../analysis/LlmClient", () => ({
  LlmClientInit: jest.fn(),
  LlmIsAvailable: jest.fn(() => true),
  LlmModel: jest.fn(() => "test-model"),
  LlmTimeoutMs: () => 45000,
  LlmOverallTimeoutMs: () => 120000,
  callLLMWithRetry: jest.fn(),
}));

import {
  BookAnalysisComputeContentHash,
  BookAnalysisGenerate,
  BookAnalysisInit,
  BookAnalysisIsStale,
} from "../analysis/BookAnalysis";
import { callLLMWithRetry } from "../analysis/LlmClient";
import { BooksDataGet } from "../books/BooksData";
import { SectionsDataListByBook } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataGetAllSectionValuesForBook,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";
import { MediaDataList } from "../media/MediaData";

beforeAll(async () => {
  await BookAnalysisInit({ DATA_DIR: "/tmp/storywriter-test" } as any);
});

const callLLMWithRetryMock = callLLMWithRetry as jest.Mock;
const booksDataGetMock = BooksDataGet as jest.Mock;
const sectionsDataListByBookMock = SectionsDataListByBook as jest.Mock;
const bookAttributesDataListByBookMock =
  BookAttributesDataListByBook as jest.Mock;
const propertiesDataListByBookMock = PropertiesDataListByBook as jest.Mock;
const propertiesDataGetAllSectionValuesMock =
  PropertiesDataGetAllSectionValuesForBook as jest.Mock;
const mediaDataListMock = MediaDataList as jest.Mock;

const VALID_LLM_RESPONSE =
  "## Summary\nGood book.\n\n## Strengths\n- Clear voice\n\n## Areas for Improvement\n- Thin ending\n\n## Suggestions\n- Expand chapter 2";

function seedBookFixtures(overrides: {
  sectionContent?: string;
  propertyValue?: string;
  propertyName?: string;
  mediaSlug?: string;
} = {}) {
  booksDataGetMock.mockResolvedValue({
    id: "book-1",
    name: "My Book",
    description: "A test book",
    writingGoal: 1000,
    dateCreated: "2026-10-16T00:00:00.000Z",
  });
  sectionsDataListByBookMock.mockResolvedValue([
    {
      id: "root-1",
      bookId: "book-1",
      parentId: null,
      type: "container",
      title: "Root",
      content: "",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      revision: 1,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
    },
    {
      id: "sec-1",
      bookId: "book-1",
      parentId: "root-1",
      type: "text",
      title: "Chapter 1",
      content: overrides.sectionContent ?? "Some real content.",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      revision: 1,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
    },
  ]);
  bookAttributesDataListByBookMock.mockResolvedValue([]);
  propertiesDataListByBookMock.mockResolvedValue([
    {
      id: "prop-1",
      bookId: "book-1",
      name: overrides.propertyName ?? "Status",
      type: "section-type",
      options: [],
      dateCreated: "2026-10-16T00:00:00.000Z",
    },
  ]);
  propertiesDataGetAllSectionValuesMock.mockResolvedValue([
    {
      sectionId: "sec-1",
      propertyId: "prop-1",
      value: overrides.propertyValue ?? "Draft",
    },
  ]);
  mediaDataListMock.mockResolvedValue([
    {
      id: "media-1",
      bookId: "book-1",
      slug: overrides.mediaSlug ?? "cover-image",
      filename: "media-1.png",
      mimeType: "image/png",
      size: 1234,
      dateCreated: "2026-10-16T00:00:00.000Z",
    },
  ]);
}

describe("BookAnalysis — property names in the prompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callLLMWithRetryMock.mockResolvedValue(VALID_LLM_RESPONSE);
    seedBookFixtures();
  });

  it("sends real property names instead of property ids", async () => {
    await BookAnalysisGenerate("book-1");

    const prompt = callLLMWithRetryMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Status=Draft");
    expect(prompt).toContain("- Status (section-type)");
    expect(prompt).not.toContain("prop-1");
  });

  it("falls back to the property id when the definition is missing", async () => {
    propertiesDataListByBookMock.mockResolvedValue([]);

    await BookAnalysisGenerate("book-1");

    const prompt = callLLMWithRetryMock.mock.calls[0][0] as string;
    expect(prompt).toContain("prop-1=Draft");
  });
});

describe("BookAnalysis — content-hash staleness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedBookFixtures();
  });

  it("is fresh when the cached hash matches the current content", async () => {
    const hash = await BookAnalysisComputeContentHash("book-1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readJson.mockResolvedValue({
      generatedAt: "2026-10-16T12:00:00.000Z",
      contentHash: hash,
    });
    // A concurrent-editor revision bump without a content change does not
    // flip the hash: only content-bearing fields are hashed.
    sectionsDataListByBookMock.mockResolvedValue([
      {
        id: "root-1",
        bookId: "book-1",
        parentId: null,
        type: "container",
        title: "Root",
        content: "",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 0,
        revision: 1,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T00:00:00.000Z",
      },
      {
        id: "sec-1",
        bookId: "book-1",
        parentId: "root-1",
        type: "text",
        title: "Chapter 1",
        content: "Some real content.",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 0,
        revision: 2,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T00:00:00.000Z",
      },
    ]);
    expect(await BookAnalysisIsStale("book-1")).toBe(false);
  });

  it("is stale when the cached hash differs from the current content", async () => {
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readJson.mockResolvedValue({
      generatedAt: "2026-10-16T12:00:00.000Z",
      contentHash: "0".repeat(64),
    });
    expect(await BookAnalysisIsStale("book-1")).toBe(true);
  });

  it("is stale when any content-bearing record changed", async () => {
    const hashBefore = await BookAnalysisComputeContentHash("book-1");

    seedBookFixtures({ sectionContent: "Changed content." });
    expect(await BookAnalysisComputeContentHash("book-1")).not.toBe(hashBefore);

    seedBookFixtures({ propertyValue: "Published" });
    expect(await BookAnalysisComputeContentHash("book-1")).not.toBe(hashBefore);

    seedBookFixtures({ propertyName: "Stage" });
    expect(await BookAnalysisComputeContentHash("book-1")).not.toBe(hashBefore);

    seedBookFixtures({ mediaSlug: "renamed-media" });
    expect(await BookAnalysisComputeContentHash("book-1")).not.toBe(hashBefore);
  });

  it("is deterministic for identical content", async () => {
    const first = await BookAnalysisComputeContentHash("book-1");
    const second = await BookAnalysisComputeContentHash("book-1");
    expect(first).toBe(second);
  });

  it("falls back to the dateUpdated comparison for legacy caches", async () => {
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readJson.mockResolvedValue({
      generatedAt: "2026-10-16T12:00:00.000Z",
    });
    // Section modified after generation → stale
    sectionsDataListByBookMock.mockResolvedValue([
      {
        id: "sec-1",
        bookId: "book-1",
        parentId: "root-1",
        type: "text",
        title: "Chapter 1",
        content: "Some real content.",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 0,
        revision: 1,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T13:00:00.000Z",
      },
    ]);
    expect(await BookAnalysisIsStale("book-1")).toBe(true);

    // Section untouched since generation → fresh
    sectionsDataListByBookMock.mockResolvedValue([
      {
        id: "sec-1",
        bookId: "book-1",
        parentId: "root-1",
        type: "text",
        title: "Chapter 1",
        content: "Some real content.",
        analysis: "",
        mediaId: null,
        caption: "",
        orderIndex: 0,
        revision: 1,
        dateCreated: "2026-10-16T00:00:00.000Z",
        dateUpdated: "2026-10-16T12:00:00.000Z",
      },
    ]);
    expect(await BookAnalysisIsStale("book-1")).toBe(false);
  });
});

describe("BookAnalysis — generate caches the content hash", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callLLMWithRetryMock.mockResolvedValue(VALID_LLM_RESPONSE);
    seedBookFixtures();
  });

  it("stores a content hash in the cached report", async () => {
    const result = await BookAnalysisGenerate("book-1");

    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const cached = fsMock.writeJson.mock.calls[0][1];
    expect(cached.contentHash).toBe(result.contentHash);
  });
});
