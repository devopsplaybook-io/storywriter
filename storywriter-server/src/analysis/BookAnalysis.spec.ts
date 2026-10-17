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
  PropertiesDataGetSectionValues: jest.fn(),
  PropertiesDataListByBook: jest.fn(),
}));

jest.mock("./LlmClient", () => ({
  LlmClientInit: jest.fn(),
  LlmIsAvailable: jest.fn(() => true),
  LlmModel: jest.fn(() => "test-model"),
  LLM_TIMEOUT_MS: 90000,
  callLLMWithRetry: jest.fn(),
}));

import {
  ANALYSIS_SECTION_FLOOR,
  ANALYSIS_TOTAL_CHAR_BUDGET,
  BookAnalysisGenerate,
  BookAnalysisInit,
  BookAnalysisIsStale,
  allocateContentBudgets,
  buildPrompt,
  countWords,
} from "./BookAnalysis";
import { callLLMWithRetry } from "./LlmClient";
import { BooksDataGet } from "../books/BooksData";
import { SectionsDataListByBook } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataGetSectionValues,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";

beforeAll(async () => {
  await BookAnalysisInit({ DATA_DIR: "/tmp/storywriter-test" } as any);
});

const callLLMWithRetryMock = callLLMWithRetry as jest.Mock;
const booksDataGetMock = BooksDataGet as jest.Mock;
const sectionsDataListByBookMock = SectionsDataListByBook as jest.Mock;
const bookAttributesDataListByBookMock =
  BookAttributesDataListByBook as jest.Mock;
const propertiesDataGetSectionValuesMock =
  PropertiesDataGetSectionValues as jest.Mock;
const propertiesDataListByBookMock = PropertiesDataListByBook as jest.Mock;

function makeSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec-1",
    bookId: "book-1",
    parentId: "root-1",
    type: "text",
    title: "Chapter 1",
    content: "",
    analysis: "",
    mediaId: null,
    caption: "",
    orderIndex: 0,
    dateCreated: "2026-10-16T00:00:00.000Z",
    dateUpdated: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

function seedBook() {
  booksDataGetMock.mockResolvedValue({
    id: "book-1",
    name: "My Book",
    description: "A test book",
    dateCreated: "2026-10-16T00:00:00.000Z",
  });
  propertiesDataGetSectionValuesMock.mockResolvedValue([]);
  propertiesDataListByBookMock.mockResolvedValue([]);
}

describe("BookAnalysis — budget helpers", () => {
  it("counts words in plain text", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("punctuation, counts as-one word")).toBe(4);
  });

  it("returns full lengths when the whole book fits in the budget", () => {
    const lengths = [500, 1500, 0];
    expect(allocateContentBudgets(lengths)).toEqual([500, 1500, 0]);
  });

  it("gives every non-empty section at least the floor before scaling up", () => {
    const lengths = Array.from({ length: 20 }, () => 20000); // 400,000 chars total
    const budgets = allocateContentBudgets(lengths);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      ANALYSIS_TOTAL_CHAR_BUDGET,
    );
    for (const budget of budgets) {
      expect(budget).toBeGreaterThanOrEqual(ANALYSIS_SECTION_FLOOR);
      expect(budget).toBeLessThanOrEqual(20000);
    }
  });

  it("allocates the remainder proportionally to content length", () => {
    const lengths = Array.from({ length: 10 }, () => 50000); // 500,000 chars total
    const budgets = allocateContentBudgets(lengths);
    // All sections have equal length, so all budgets must be equal
    expect(new Set(budgets).size).toBe(1);
    // 120,000 budget / 10 sections = 12,000 each
    expect(budgets[0]).toBe(12000);
  });

  it("scales floors down when they alone exhaust the budget", () => {
    const lengths = Array.from({ length: 200 }, () => 5000); // 1,000,000 chars, floors alone = 200,000
    const budgets = allocateContentBudgets(lengths);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      ANALYSIS_TOTAL_CHAR_BUDGET,
    );
    expect(budgets[0]).toBeLessThan(ANALYSIS_SECTION_FLOOR);
  });

  it("never exceeds the total budget", () => {
    const lengths = [30000, 1000, 0, 95000, 40000, 120000];
    const budgets = allocateContentBudgets(lengths);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      ANALYSIS_TOTAL_CHAR_BUDGET,
    );
  });
});

describe("BookAnalysis — buildPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const book = {
    name: "My Book",
    description: "A test book",
    dateCreated: "2026-10-16T00:00:00.000Z",
  };

  it("includes word counts per section and in the statistics", () => {
    const sections = [
      makeSection({
        id: "root-1",
        parentId: null,
        title: "Root",
        content: "",
      }),
      makeSection({ content: "one two three four five" }),
    ];
    const prompt = buildPrompt(book, sections, [], [], {});
    expect(prompt).toContain("**Chapter 1** (5 words)");
    expect(prompt).toContain("Total words: 5");
  });

  it("marks sections as truncated when over their budget", () => {
    const sections = [
      makeSection({
        id: "root-1",
        parentId: null,
        title: "Root",
        content: "",
      }),
      makeSection({ content: "word ".repeat(60000).trim() }), // 60,000 words
    ];
    const prompt = buildPrompt(book, sections, [], [], {});
    expect(prompt).toContain("(truncated,");
    expect(prompt).toContain("60000 words total");
  });

  it("includes attributes and property values", () => {
    const sections = [
      makeSection({
        id: "root-1",
        parentId: null,
        title: "Root",
        content: "",
      }),
      makeSection({ content: "Some content" }),
    ];
    const prompt = buildPrompt(
      book,
      sections,
      [{ title: "Main Character", content: "Aria, a cartographer." }],
      [{ id: "p1", name: "Status", type: "text" }],
      { "sec-1": [{ propertyName: "Status", value: "Draft" }] },
    );
    expect(prompt).toContain("### Main Character");
    expect(prompt).toContain("Aria, a cartographer.");
    expect(prompt).toContain("Status=Draft");
    expect(prompt).toContain("- Status (text)");
  });
});

describe("BookAnalysis — generate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedBook();
    sectionsDataListByBookMock.mockResolvedValue([
      makeSection({
        id: "root-1",
        parentId: null,
        title: "Root",
        content: "",
      }),
      makeSection({ content: "Some real content for the prompt." }),
    ]);
    bookAttributesDataListByBookMock.mockResolvedValue([]);
  });

  it("caches a parsed report on success", async () => {
    callLLMWithRetryMock.mockResolvedValue(
      "## Summary\nGood book.\n\n## Strengths\n- Clear voice\n\n## Areas for Improvement\n- Thin ending\n\n## Suggestions\n- Expand chapter 2",
    );

    const result = await BookAnalysisGenerate("book-1");

    expect(result.summary).toBe("Good book.");
    expect(result.strengths).toBe("- Clear voice");
    expect(result.improvements).toBe("- Thin ending");
    expect(result.suggestions).toBe("- Expand chapter 2");
    expect(fsMock.writeJson).toHaveBeenCalledTimes(1);
  });

  it("throws on LLM failure and does not cache the error as report content", async () => {
    callLLMWithRetryMock.mockRejectedValue(new Error("API unreachable"));

    await expect(BookAnalysisGenerate("book-1")).rejects.toThrow(
      "LLM analysis generation failed: API unreachable",
    );
    expect(fsMock.writeJson).not.toHaveBeenCalled();
  });

  it("throws on an empty LLM response", async () => {
    callLLMWithRetryMock.mockResolvedValue("short");

    await expect(BookAnalysisGenerate("book-1")).rejects.toThrow(
      "LLM returned an empty response",
    );
    expect(fsMock.writeJson).not.toHaveBeenCalled();
  });

  it("puts the whole response in summary when no heading matches", async () => {
    callLLMWithRetryMock.mockResolvedValue(
      "A long freeform response without any headings, definitely longer than twenty characters.",
    );

    const result = await BookAnalysisGenerate("book-1");
    expect(result.summary).toContain("freeform response without any headings");
  });
});

describe("BookAnalysis — staleness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is not stale when there is no cached report", async () => {
    fsMock.pathExists.mockResolvedValue(false);
    expect(await BookAnalysisIsStale("book-1")).toBe(false);
  });

  it("is stale when a section was modified after generation", async () => {
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readJson.mockResolvedValue({
      generatedAt: "2026-10-16T12:00:00.000Z",
    });
    sectionsDataListByBookMock.mockResolvedValue([
      makeSection({ dateUpdated: "2026-10-16T13:00:00.000Z" }),
    ]);
    expect(await BookAnalysisIsStale("book-1")).toBe(true);
  });

  it("is fresh when no section was modified after generation", async () => {
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readJson.mockResolvedValue({
      generatedAt: "2026-10-16T12:00:00.000Z",
    });
    sectionsDataListByBookMock.mockResolvedValue([
      makeSection({ dateUpdated: "2026-10-16T10:00:00.000Z" }),
      makeSection({ id: "sec-2", dateUpdated: "2026-10-16T12:00:00.000Z" }),
    ]);
    expect(await BookAnalysisIsStale("book-1")).toBe(false);
  });
});
