import { BooksDataGet } from "../books/BooksData";
import { Section } from "../model/Section";
import { SectionsDataUpdate } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataGetSectionValues,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";
import { callLLMWithRetry, LlmIsAvailable } from "./LlmClient";
import { countWords } from "./BookAnalysis";

const logger = console;

export const SECTION_ANALYSIS_TOTAL_CHAR_BUDGET = 120000;

export type AiActionId = "continue" | "summarize" | "improve" | "brainstorm";

export const AI_ACTION_IDS: AiActionId[] = [
  "continue",
  "summarize",
  "improve",
  "brainstorm",
];

export function isAiActionId(action: string): action is AiActionId {
  return (AI_ACTION_IDS as string[]).includes(action);
}

export class LlmUnavailableError extends Error {
  constructor() {
    super(
      "AI assistance is not configured on this server (LLM_API_KEY missing)",
    );
  }
}

// ── Generate analysis notes for a section ─────────────────────────────────────

export async function SectionAnalysisGenerate(
  section: Section,
): Promise<Section> {
  assertLlmAvailable();

  const book = await BooksDataGet(section.bookId);
  const attributes = await BookAttributesDataListByBook(section.bookId);
  const propertyValues = await resolveSectionPropertyValues(section);

  const prompt = buildSectionAnalysisPrompt(
    section,
    book?.name || "",
    attributes,
    propertyValues,
  );

  logger.info(
    `[SectionAnalysis] Generating analysis for section "${section.title}"`,
  );
  const analysis = await callLLMWithRetry(prompt, {
    systemPrompt: SECTION_ANALYSIS_SYSTEM_PROMPT,
    temperature: 0.4,
  });

  if (!analysis || !analysis.trim()) {
    throw new Error("LLM returned an empty response. Please check API configuration.");
  }

  section.analysis = analysis.trim();
  await SectionsDataUpdate(section);
  logger.info(
    `[SectionAnalysis] Analysis saved for section "${section.title}"`,
  );
  return section;
}

// ── In-editor AI actions (return text only, write nothing) ────────────────────

export async function SectionAiActionGenerate(
  section: Section,
  action: AiActionId,
  selection?: string,
): Promise<string> {
  assertLlmAvailable();

  const attributes = await BookAttributesDataListByBook(section.bookId);
  const prompt = buildAiActionPrompt(action, section, attributes, selection);
  const { systemPrompt, temperature } = AI_ACTION_PROMPTS[action];

  logger.info(`[SectionAnalysis] AI action "${action}" on section "${section.title}"`);
  const text = await callLLMWithRetry(prompt, { systemPrompt, temperature });

  if (!text || !text.trim()) {
    throw new Error("LLM returned an empty response. Please check API configuration.");
  }
  return text.trim();
}

// ── Prompt building (exported for unit tests) ─────────────────────────────────

async function resolveSectionPropertyValues(
  section: Section,
): Promise<{ propertyName: string; value: string }[]> {
  const values = await PropertiesDataGetSectionValues(section.id);
  if (values.length === 0) {
    return [];
  }
  const properties = await PropertiesDataListByBook(section.bookId);
  const nameById = new Map(properties.map((p) => [p.id, p.name]));
  return values.map((v) => ({
    propertyName: nameById.get(v.propertyId) || v.propertyId,
    value: v.value || "",
  }));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}… (truncated)`;
}

export function buildSectionAnalysisPrompt(
  section: {
    title: string;
    content: string;
  },
  bookName: string,
  attributes: { title: string; content: string }[],
  propertyValues: { propertyName: string; value: string }[],
): string {
  const attrText =
    attributes.length > 0
      ? attributes
          .map((a) => `### ${a.title}\n${truncate(a.content, 2000)}`)
          .join("\n\n")
      : "(no attributes defined)";

  const propText =
    propertyValues.length > 0
      ? propertyValues
          .map((p) => `- ${p.propertyName}: ${p.value}`)
          .join("\n")
      : "(none)";

  return `Write working notes for the section below: keep track of what happens, how it relates to the book's attributes (story bible), and what could be improved next.

## Book: ${bookName || "(unknown)"}

## Section: ${section.title || "(untitled)"} (${countWords(section.content)} words)
${truncate(section.content, SECTION_ANALYSIS_TOTAL_CHAR_BUDGET)}

## Attributes
${attrText}

## Section Properties
${propText}`;
}

const SECTION_ANALYSIS_SYSTEM_PROMPT =
  "You are a writing coach keeping working notes on a novelist's manuscript section. " +
  "Write freeform markdown notes for the author that cover: a brief recap of what happens in the section, " +
  "continuity points to remember (characters, timeline, open threads), consistency with the book's attributes " +
  "(story bible), and 2-3 concrete suggestions to strengthen the section. " +
  "Be specific and reference the actual content. Do not rewrite the section.";

export const AI_ACTION_PROMPTS: Record<
  AiActionId,
  { systemPrompt: string; temperature: number }
> = {
  continue: {
    systemPrompt:
      "You are a ghostwriter continuing the user's novel. Match the established voice, tone and tense. " +
      "Continue seamlessly from where the text ends: do not repeat existing content, do not add commentary, " +
      "do not wrap the continuation in quotes. Output only the continuation prose.",
    temperature: 0.7,
  },
  summarize: {
    systemPrompt:
      "You are a concise summarizer for a novelist. Summarize the given text in a short markdown outline " +
      "(a few bullet points) capturing events, decisions and open questions. Output only the summary.",
    temperature: 0.3,
  },
  improve: {
    systemPrompt:
      "You are a line editor for a novelist. Rewrite the given text to improve clarity, flow, imagery and pacing " +
      "while preserving the author's voice, meaning and tense. Output only the improved prose, no commentary.",
    temperature: 0.5,
  },
  brainstorm: {
    systemPrompt:
      "You are a brainstorming partner for a novelist. Propose a short list of concrete, actionable ideas " +
      "grounded in the story context provided (attributes/story bible included when available). " +
      "Output only the ideas as markdown bullets.",
    temperature: 0.7,
  },
};

export function buildAiActionPrompt(
  action: AiActionId,
  section: {
    title: string;
    content: string;
  },
  attributes: { title: string; content: string }[],
  selection?: string,
): string {
  const attrText =
    attributes.length > 0
      ? attributes
          .map((a) => `### ${a.title}\n${truncate(a.content, 2000)}`)
          .join("\n\n")
      : "(no attributes defined)";

  const budget = SECTION_ANALYSIS_TOTAL_CHAR_BUDGET;

  switch (action) {
    case "continue":
      return `Continue the following text. Use the book's attributes as context for characters, settings and facts.

### Attributes
${attrText}

### Section: ${section.title || "(untitled)"} — text ends here, continue from the end
${truncate(section.content, budget)}`;
    case "summarize":
      return `Summarize the following section text.

### Section: ${section.title || "(untitled)"}
${truncate(section.content, budget)}`;
    case "improve":
      return selection
        ? `Improve the following passage from section "${section.title || "(untitled)"}". Keep its place in the text: rewrite only this passage.

### Attributes
${attrText}

### Passage to improve
${truncate(selection, budget)}`
        : `Improve the following section text. Keep its meaning, voice and tense.

### Attributes
${attrText}

### Section: ${section.title || "(untitled)"}
${truncate(section.content, budget)}`;
    case "brainstorm":
      return `Brainstorm ideas for the section "${section.title || "(untitled)"}" of the book. Use the current text and the book's attributes as context.

### Attributes
${attrText}

### Section text
${truncate(section.content, budget)}`;
  }
}

function assertLlmAvailable(): void {
  if (!LlmIsAvailable()) {
    throw new LlmUnavailableError();
  }
}
