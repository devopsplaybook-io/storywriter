jest.mock("../books/BooksData", () => ({
  BooksDataGet: jest.fn(),
}));

jest.mock("../sections/SectionsData", () => ({
  SectionsDataListByBook: jest.fn(),
  SectionsDataUpdate: jest.fn(),
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
  AI_ACTION_PROMPTS,
  LlmUnavailableError,
  SectionAiActionGenerate,
  SectionAnalysisGenerate,
  buildAiActionPrompt,
  buildSectionAnalysisPrompt,
  isAiActionId,
} from "./SectionAnalysis";
import { callLLMWithRetry, LlmIsAvailable } from "./LlmClient";
import { BooksDataGet } from "../books/BooksData";
import { SectionsDataUpdate } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataGetSectionValues,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";

const callLLMWithRetryMock = callLLMWithRetry as jest.Mock;
const llmIsAvailableMock = LlmIsAvailable as jest.Mock;
const booksDataGetMock = BooksDataGet as jest.Mock;
const sectionsDataUpdateMock = SectionsDataUpdate as jest.Mock;
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
    content: "Aria unfolded the map.",
    analysis: "",
    mediaId: null,
    caption: "",
    orderIndex: 0,
    dateCreated: "2026-10-16T00:00:00.000Z",
    dateUpdated: "2026-10-16T00:00:00.000Z",
    ...overrides,
  } as any;
}

const attributes = [
  { title: "Main Character", content: "Aria, a cartographer." },
];

beforeEach(() => {
  jest.clearAllMocks();
  llmIsAvailableMock.mockReturnValue(true);
  booksDataGetMock.mockResolvedValue({
    id: "book-1",
    name: "My Book",
  });
  bookAttributesDataListByBookMock.mockResolvedValue(attributes);
  propertiesDataGetSectionValuesMock.mockResolvedValue([
    { propertyId: "prop-1", value: "Draft" },
  ]);
  propertiesDataListByBookMock.mockResolvedValue([
    { id: "prop-1", name: "Status", type: "text" },
  ]);
});

describe("SectionAnalysis — prompt building", () => {
  it("builds a section analysis prompt with content, attributes and named properties", () => {
    const prompt = buildSectionAnalysisPrompt(
      makeSection(),
      "My Book",
      attributes,
      [{ propertyName: "Status", value: "Draft" }],
    );
    expect(prompt).toContain("## Book: My Book");
    expect(prompt).toContain("## Section: Chapter 1");
    expect(prompt).toContain("Aria unfolded the map.");
    expect(prompt).toContain("### Main Character");
    expect(prompt).toContain("Aria, a cartographer.");
    expect(prompt).toContain("- Status: Draft");
  });

  it("falls back to the raw property id when the definition is unknown", () => {
    const prompt = buildSectionAnalysisPrompt(
      makeSection(),
      "My Book",
      [],
      [{ propertyName: "prop-unknown", value: "v" }],
    );
    expect(prompt).toContain("- prop-unknown: v");
  });

  it("builds per-action prompts", () => {
    const section = makeSection();
    const continuePrompt = buildAiActionPrompt(
      "continue",
      section,
      attributes,
    );
    expect(continuePrompt).toContain("Continue the following text");
    expect(continuePrompt).toContain("Aria unfolded the map.");

    const summarizePrompt = buildAiActionPrompt("summarize", section, []);
    expect(summarizePrompt).toContain("Summarize the following section text");

    const improveWhole = buildAiActionPrompt("improve", section, []);
    expect(improveWhole).toContain("Improve the following section text");

    const improveSelection = buildAiActionPrompt(
      "improve",
      section,
      attributes,
      "Aria unfolded the map.",
    );
    expect(improveSelection).toContain("### Passage to improve");
    expect(improveSelection).toContain("Aria unfolded the map.");

    const brainstormPrompt = buildAiActionPrompt(
      "brainstorm",
      section,
      attributes,
    );
    expect(brainstormPrompt).toContain("Brainstorm ideas");
    expect(brainstormPrompt).toContain("Aria, a cartographer.");
  });

  it("configures distinct temperatures per action", () => {
    expect(AI_ACTION_PROMPTS.continue.temperature).toBe(0.7);
    expect(AI_ACTION_PROMPTS.brainstorm.temperature).toBe(0.7);
    expect(AI_ACTION_PROMPTS.improve.temperature).toBe(0.5);
    expect(AI_ACTION_PROMPTS.summarize.temperature).toBe(0.3);
  });

  it("whitelists known actions only", () => {
    expect(isAiActionId("continue")).toBe(true);
    expect(isAiActionId("summarize")).toBe(true);
    expect(isAiActionId("improve")).toBe(true);
    expect(isAiActionId("brainstorm")).toBe(true);
    expect(isAiActionId("delete-everything")).toBe(false);
  });
});

describe("SectionAnalysis — generate", () => {
  it("saves generated notes on the section and persists the update", async () => {
    callLLMWithRetryMock.mockResolvedValue(
      "### Recap\nAria opens the map.\n\n### Suggestions\n- Add sensory detail.",
    );

    const section = makeSection();
    const updated = await SectionAnalysisGenerate(section);

    expect(callLLMWithRetryMock).toHaveBeenCalledTimes(1);
    expect(updated.analysis).toContain("Aria opens the map.");
    expect(sectionsDataUpdateMock).toHaveBeenCalledTimes(1);
    expect(sectionsDataUpdateMock).toHaveBeenCalledWith(updated);
  });

  it("throws on an empty LLM response and writes nothing", async () => {
    callLLMWithRetryMock.mockResolvedValue("   ");

    const section = makeSection();
    await expect(SectionAnalysisGenerate(section)).rejects.toThrow(
      "LLM returned an empty response",
    );
    expect(sectionsDataUpdateMock).not.toHaveBeenCalled();
  });

  it("fails fast when the LLM is not configured", async () => {
    llmIsAvailableMock.mockReturnValue(false);

    const section = makeSection();
    await expect(SectionAnalysisGenerate(section)).rejects.toThrow(
      LlmUnavailableError,
    );
    expect(callLLMWithRetryMock).not.toHaveBeenCalled();
    expect(sectionsDataUpdateMock).not.toHaveBeenCalled();
  });
});

describe("SectionAnalysis — AI actions", () => {
  it("returns the action text and writes nothing", async () => {
    callLLMWithRetryMock.mockResolvedValue("  Continued prose here.  ");

    const text = await SectionAiActionGenerate(
      makeSection(),
      "continue",
    );

    expect(text).toBe("Continued prose here.");
    expect(callLLMWithRetryMock).toHaveBeenCalledWith(
      expect.stringContaining("Continue the following text"),
      expect.objectContaining({ temperature: 0.7 }),
    );
    expect(sectionsDataUpdateMock).not.toHaveBeenCalled();
  });

  it("passes the selection for improve", async () => {
    callLLMWithRetryMock.mockResolvedValue("Improved text.");

    await SectionAiActionGenerate(
      makeSection(),
      "improve",
      "Aria unfolded the map.",
    );

    expect(callLLMWithRetryMock).toHaveBeenCalledWith(
      expect.stringContaining("### Passage to improve"),
      expect.objectContaining({ temperature: 0.5 }),
    );
  });

  it("fails fast when the LLM is not configured", async () => {
    llmIsAvailableMock.mockReturnValue(false);

    await expect(
      SectionAiActionGenerate(makeSection(), "summarize"),
    ).rejects.toThrow(LlmUnavailableError);
    expect(callLLMWithRetryMock).not.toHaveBeenCalled();
  });
});
