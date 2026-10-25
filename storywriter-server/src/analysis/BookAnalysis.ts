import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { BooksDataGet } from "../books/BooksData";
import { SectionsDataListByBook } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataListByBook,
  PropertiesDataGetAllSectionValuesForBook,
} from "../properties/PropertiesData";
import { MediaDataList } from "../media/MediaData";
import { callLLMWithRetry } from "./LlmClient";

const logger = console;

let config: Config;

// ── Public Interface ──────────────────────────────────────────────────────────

export async function BookAnalysisInit(configIn: Config): Promise<void> {
  config = configIn;
}

// Character budget for the book content sent to the LLM. The chat API budgets
// in tokens (~4 chars/token); a hard character constant keeps this dependency-
// free while approximating the same limit.
export const ANALYSIS_TOTAL_CHAR_BUDGET = 120000;
// Every non-empty section is guaranteed this much content so thin sections
// are never crowded out by long ones.
export const ANALYSIS_SECTION_FLOOR = 1000;

export interface BookAnalysisResult {
  generatedAt: string;
  bookId: string;
  bookName: string;
  summary: string;
  strengths: string;
  improvements: string;
  suggestions: string;
  rawOutput: string | null;
  /** Hash of all content-bearing records at generation time. */
  contentHash?: string;
}

export async function BookAnalysisGetCached(
  bookId: string,
): Promise<BookAnalysisResult | null> {
  try {
    const filePath = getFilePath(bookId);
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    return await fs.readJson(filePath);
  } catch (error) {
    logger.error(
      `[BookAnalysis] Failed to read cached analysis for book ${bookId}: ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * A cached report is stale when any content-bearing record (book metadata,
 * sections, attributes, properties, property values, media) changed since it
 * was generated. The comparison is a content hash; reports cached before the
 * hash existed fall back to the section dateUpdated comparison.
 */
export async function BookAnalysisIsStale(
  bookId: string,
): Promise<boolean> {
  const cached = await BookAnalysisGetCached(bookId);
  if (!cached || !cached.generatedAt) {
    return false;
  }
  if (cached.contentHash) {
    const currentHash = await BookAnalysisComputeContentHash(bookId);
    return currentHash !== cached.contentHash;
  }
  // Legacy cache without a content hash
  const generatedAt = Date.parse(cached.generatedAt);
  if (Number.isNaN(generatedAt)) {
    return false;
  }
  const sections = await SectionsDataListByBook(bookId);
  return sections.some((section) => {
    const updated = Date.parse(section.dateUpdated);
    return !Number.isNaN(updated) && updated > generatedAt;
  });
}

// ── Content hash ──────────────────────────────────────────────────────────────

/**
 * Gather every content-bearing record of a book in one bulk query per table.
 * The shape is canonical (fixed fields, sorted keys when hashed) so equal
 * content always produces the same hash.
 */
export async function BookAnalysisCollectContent(
  bookId: string,
): Promise<Record<string, unknown>> {
  const book = await BooksDataGet(bookId);
  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }
  const sections = await SectionsDataListByBook(bookId);
  const attributes = await BookAttributesDataListByBook(bookId);
  const properties = await PropertiesDataListByBook(bookId);
  const sectionPropertyValues = await PropertiesDataGetAllSectionValuesForBook(
    bookId,
  );
  const mediaItems = await MediaDataList(bookId);

  return {
    book: {
      name: book.name,
      description: book.description,
      writingGoal: book.writingGoal,
    },
    sections: sections
      .map((s) => ({
        id: s.id,
        parentId: s.parentId,
        type: s.type,
        title: s.title,
        content: s.content,
        analysis: s.analysis,
        mediaId: s.mediaId,
        caption: s.caption,
        orderIndex: s.orderIndex,
        dateUpdated: s.dateUpdated,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    attributes: attributes
      .map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        dateUpdated: a.dateUpdated,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    properties: properties
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        options: p.options,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    sectionPropertyValues: sectionPropertyValues
      .map((v) => ({
        sectionId: v.sectionId,
        propertyId: v.propertyId,
        value: v.value,
      }))
      .sort(
        (a, b) =>
          (a.sectionId + a.propertyId < b.sectionId + b.propertyId ? -1 : 1),
      ),
    media: mediaItems
      .map((m) => ({
        id: m.id,
        slug: m.slug,
        mimeType: m.mimeType,
        size: m.size,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

function CanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(CanonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${CanonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function BookAnalysisComputeContentHash(
  bookId: string,
): Promise<string> {
  const content = await BookAnalysisCollectContent(bookId);
  return crypto
    .createHash("sha256")
    .update(CanonicalJson(content))
    .digest("hex");
}

// ── Generate analysis for a book ──────────────────────────────────────────────

export async function BookAnalysisGenerate(
  bookId: string,
): Promise<BookAnalysisResult> {
  const contentHash = await BookAnalysisComputeContentHash(bookId);
  const book = await BooksDataGet(bookId);
  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  logger.info(`[BookAnalysis] Collecting data for book "${book.name}"`);

  const sections = await SectionsDataListByBook(bookId);
  const attributes = await BookAttributesDataListByBook(bookId);
  const properties = await PropertiesDataListByBook(bookId);

  // One bulk query for all section property values; real property names are
  // resolved from the definitions (falling back to the id for unknown ones).
  const nameById = new Map(properties.map((p) => [p.id, p.name]));
  const values = await PropertiesDataGetAllSectionValuesForBook(bookId);
  const sectionPropertyValues: Record<
    string,
    { propertyName: string; value: string }[]
  > = {};
  for (const v of values) {
    const list = sectionPropertyValues[v.sectionId] || [];
    list.push({
      propertyName: nameById.get(v.propertyId) || v.propertyId,
      value: v.value || "",
    });
    sectionPropertyValues[v.sectionId] = list;
  }

  const prompt = buildPrompt(
    book,
    sections,
    attributes,
    properties,
    sectionPropertyValues,
  );

  let fullContent: string;

  try {
    fullContent = await callLLMWithRetry(prompt, { systemPrompt: BOOK_ANALYSIS_SYSTEM_PROMPT });
  } catch (error) {
    logger.error(
      `[BookAnalysis] LLM API call failed for book ${bookId}: ${(error as Error).message}`,
    );
    // Fail loudly: the cache keeps the last good report and the caller
    // surfaces the error, instead of storing the failure as report content.
    throw new Error(
      `LLM analysis generation failed: ${(error as Error).message}`,
    );
  }

  if (!fullContent || fullContent.trim().length < 20) {
    throw new Error("LLM returned an empty response. Please check API configuration.");
  }

  const summaryMatch = fullContent.match(
    /^## Summary\s*\n([\s\S]*?)(?=\n^## |\n?$)/im,
  );
  const strengthsMatch = fullContent.match(
    /^## Strengths\s*\n([\s\S]*?)(?=\n^## |\n?$)/im,
  );
  const improvementsMatch = fullContent.match(
    /^## Areas for Improvement\s*\n([\s\S]*?)(?=\n^## |\n?$)/im,
  );
  const suggestionsMatch = fullContent.match(
    /^## Suggestions\s*\n([\s\S]*)/im,
  );

  let summary = (summaryMatch?.[1] || "").trim();
  const strengths = (strengthsMatch?.[1] || "").trim();
  const improvements = (improvementsMatch?.[1] || "").trim();
  const suggestions = (suggestionsMatch?.[1] || "").trim();

  // Fallback: if no sections matched, put everything in summary
  if (!summary && !strengths && !improvements && !suggestions) {
    summary = fullContent.trim();
  }

  const result: BookAnalysisResult = {
    generatedAt: new Date().toISOString(),
    bookId,
    bookName: book.name,
    summary,
    strengths,
    improvements,
    suggestions,
    rawOutput: fullContent || null,
    contentHash,
  };

  const filePath = getFilePath(bookId);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, result);
  logger.info(
    `[BookAnalysis] Analysis generated and cached for book "${book.name}"`,
  );

  return result;
}

// ── Prompt building (exported for unit tests) ─────────────────────────────────

export function countWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Split the total character budget across sections: every non-empty section
 * gets a floor first, the remainder is distributed proportionally to content
 * length. Returns one budget per input length (0 for empty sections).
 */
export function allocateContentBudgets(lengths: number[]): number[] {
  const nonEmpty = lengths.map((len) => Math.max(0, len));
  const totalLength = nonEmpty.reduce((sum, len) => sum + len, 0);
  if (totalLength <= ANALYSIS_TOTAL_CHAR_BUDGET) {
    return nonEmpty;
  }
  const base = nonEmpty.map((len) => Math.min(len, ANALYSIS_SECTION_FLOOR));
  const baseSum = base.reduce((sum, len) => sum + len, 0);
  const remaining = ANALYSIS_TOTAL_CHAR_BUDGET - baseSum;
  if (remaining <= 0) {
    // The floors alone exhaust the budget: scale them down proportionally.
    const scale = ANALYSIS_TOTAL_CHAR_BUDGET / baseSum;
    return base.map((len) => Math.floor(len * scale));
  }
  return nonEmpty.map((len, i) =>
    Math.min(len, base[i] + Math.floor((remaining * len) / totalLength)),
  );
}

export function buildPrompt(
  book: { name: string; description: string; dateCreated: string },
  sections: {
    id: string;
    title: string;
    content: string;
    parentId: string | null;
    orderIndex: number;
  }[],
  attributes: { title: string; content: string }[],
  properties: { id: string; name: string; type: string }[],
  sectionPropertyValues: Record<
    string,
    { propertyName: string; value: string }[]
  >,
): string {
  const rootSection = sections.find((s) => s.parentId === null);
  const nonRootSections = sections.filter((s) => s.parentId !== null);

  // Budget the whole content across sections instead of clipping each one
  const budgets = allocateContentBudgets(sections.map((s) => s.content.length));
  const budgetById = new Map<string, number>();
  sections.forEach((s, i) => budgetById.set(s.id, budgets[i]));

  // Build a tree representation
  function buildTree(parentId: string | null, depth: number): string {
    const children = sections.filter((s) => s.parentId === parentId);
    if (children.length === 0) return "";
    return children
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => {
        const indent = "  ".repeat(depth);
        const budget = budgetById.get(s.id) || 0;
        let contentPreview: string;
        if (!s.content) {
          contentPreview = "(empty)";
        } else if (s.content.length > budget) {
          contentPreview = `${s.content.substring(0, budget)}… (truncated, ${countWords(s.content)} words total)`;
        } else {
          contentPreview = s.content;
        }
        const propValues = sectionPropertyValues[s.id]
          ? `\n${indent}  Properties: ${sectionPropertyValues[s.id].map((p) => `${p.propertyName}=${p.value}`).join(", ")}`
          : "";
        return `${indent}- **${s.title}** (${countWords(s.content)} words)\n${indent}  Content: ${contentPreview}${propValues}\n${buildTree(s.id, depth + 1)}`;
      })
      .join("");
  }

  const tree = buildTree(rootSection?.id || null, 0);

  const attrText =
    attributes.length > 0
      ? attributes
          .map(
            (a) =>
              `### ${a.title}\n${a.content.substring(0, 500)}${a.content.length > 500 ? "..." : ""}`,
          )
          .join("\n\n")
      : "(no attributes defined)";

  const propDefs =
    properties.length > 0
      ? properties.map((p) => `- ${p.name} (${p.type})`).join("\n")
      : "(no property definitions)";

  return `Analyze the following book and provide insights as a writing coach and editor.

## Book: ${book.name}
Description: ${book.description || "(none)"}
Created: ${book.dateCreated}

## Structure (${sections.length} sections)
${tree}

## Attributes (${attributes.length})
${attrText}

## Property Definitions (${properties.length})
${propDefs}

## Statistics
- Total sections: ${sections.length}
- Sections with content: ${nonRootSections.filter((s) => s.content && s.content.trim().length > 0).length}
- Empty sections: ${nonRootSections.filter((s) => !s.content || s.content.trim().length === 0).length}
- Total words: ${sections.reduce((sum, s) => sum + countWords(s.content), 0).toLocaleString("en-US")}
- Total attributes: ${attributes.length}
- Property definitions: ${properties.length}`;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function getFilePath(bookId: string): string {
  return path.join(config.DATA_DIR, `book-analysis-${bookId}.json`);
}

/**
 * Remove the cached analysis report of a book (used when the book is deleted).
 * The path is built from a book id that the caller has already validated.
 */
export async function BookAnalysisDeleteCache(bookId: string): Promise<void> {
  await fs.remove(getFilePath(bookId));
}

const BOOK_ANALYSIS_SYSTEM_PROMPT =
  "You are an expert writing coach and book editor. " +
  "Analyze the provided book structure, content, and metadata to give actionable insights.\n\n" +
  "IMPORTANT: Address the author directly using 'you' and 'your' throughout the report.\n\n" +
  "Output your answer in exactly four sections using these headings:\n\n" +
  "## Summary\n" +
  "A concise overview (2-3 paragraphs) of the book's current state: " +
  "structure, scope, completeness, and overall impression.\n\n" +
  "## Strengths\n" +
  "3-6 bullet points highlighting what works well: " +
  "strong sections, good organization, consistent voice, compelling content, etc.\n\n" +
  "## Areas for Improvement\n" +
  "3-6 bullet points identifying weaknesses: " +
  "empty or thin sections, structural issues, inconsistencies, gaps in content or narrative.\n\n" +
  "## Suggestions\n" +
  "4-8 concrete, prioritized action items the author can take to improve the book. " +
  "Be specific — reference actual section titles and content. " +
  "Include advice on pacing, structure, character development, and writing craft where relevant. " +
  "Do NOT give generic advice like 'write more' — be concrete.";
