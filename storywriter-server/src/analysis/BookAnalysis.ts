import axios from "axios";
import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { BooksDataGet } from "../books/BooksData";
import { SectionsDataListByBook } from "../sections/SectionsData";
import { BookAttributesDataListByBook } from "../attributes/BookAttributesData";
import {
  PropertiesDataListByBook,
  PropertiesDataGetSectionValues,
} from "../properties/PropertiesData";

const logger = console;

let config: Config;

// ── Public Interface ──────────────────────────────────────────────────────────

export async function BookAnalysisInit(configIn: Config): Promise<void> {
  config = configIn;
  if (configIn.LLM_API_KEY) {
    logger.info("[BookAnalysis] LLM analysis feature enabled");
  } else {
    logger.info(
      "[BookAnalysis] LLM analysis feature disabled (no API key configured)",
    );
  }
}

export interface BookAnalysisResult {
  generatedAt: string;
  bookId: string;
  bookName: string;
  summary: string;
  strengths: string;
  improvements: string;
  suggestions: string;
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

// ── Generate analysis for a book ──────────────────────────────────────────────

export async function BookAnalysisGenerate(
  bookId: string,
): Promise<BookAnalysisResult> {
  const book = await BooksDataGet(bookId);
  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  logger.info(`[BookAnalysis] Collecting data for book "${book.name}"`);

  const sections = await SectionsDataListByBook(bookId);
  const attributes = await BookAttributesDataListByBook(bookId);
  const properties = await PropertiesDataListByBook(bookId);

  // Gather property values for each section
  const sectionPropertyValues: Record<
    string,
    { propertyName: string; value: string }[]
  > = {};
  for (const section of sections) {
    try {
      const values = await PropertiesDataGetSectionValues(section.id);
      if (values.length > 0) {
        sectionPropertyValues[section.id] = values.map((v) => ({
          propertyName: v.propertyId,
          value: v.value || "",
        }));
      }
    } catch {
      // property values may not exist for all sections
    }
  }

  const prompt = buildPrompt(
    book,
    sections,
    attributes,
    properties,
    sectionPropertyValues,
  );

  let summary = "";
  let strengths = "";
  let improvements = "";
  let suggestions = "";

  try {
    const llmResponse = await callLLMWithRetry(prompt);
    const fullContent = llmResponse || "";

    if (!fullContent || fullContent.trim().length < 20) {
      logger.warn(
        `[BookAnalysis] LLM returned empty or very short response for book ${bookId}`,
      );
      summary =
        "LLM returned an empty response. Please check API configuration.";
    } else {
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

      summary = (summaryMatch?.[1] || "").trim();
      strengths = (strengthsMatch?.[1] || "").trim();
      improvements = (improvementsMatch?.[1] || "").trim();
      suggestions = (suggestionsMatch?.[1] || "").trim();

      // Fallback: if no sections matched, put everything in summary
      if (!summary && !strengths && !improvements && !suggestions) {
        summary = fullContent.trim();
      }
    }
  } catch (error) {
    logger.error(
      `[BookAnalysis] LLM API call failed for book ${bookId}: ${(error as Error).message}`,
    );
    summary = `LLM analysis generation failed: ${(error as Error).message}`;
  }

  const result: BookAnalysisResult = {
    generatedAt: new Date().toISOString(),
    bookId,
    bookName: book.name,
    summary,
    strengths,
    improvements,
    suggestions,
  };

  const filePath = getFilePath(bookId);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, result);
  logger.info(
    `[BookAnalysis] Analysis generated and cached for book "${book.name}"`,
  );

  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function getFilePath(bookId: string): string {
  return path.join(config.DATA_DIR, `book-analysis-${bookId}.json`);
}

function buildPrompt(
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

  // Build a tree representation
  function buildTree(parentId: string | null, depth: number): string {
    const children = sections.filter((s) => s.parentId === parentId);
    if (children.length === 0) return "";
    return children
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => {
        const indent = "  ".repeat(depth);
        const contentPreview = s.content
          ? s.content.substring(0, 300) + (s.content.length > 300 ? "..." : "")
          : "(empty)";
        const propValues = sectionPropertyValues[s.id]
          ? `\n${indent}  Properties: ${sectionPropertyValues[s.id].map((p) => `${p.propertyName}=${p.value}`).join(", ")}`
          : "";
        return `${indent}- **${s.title}**\n${indent}  Content: ${contentPreview}${propValues}\n${buildTree(s.id, depth + 1)}`;
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
- Total attributes: ${attributes.length}
- Property definitions: ${properties.length}`;
}

// ── LLM API call with retry ───────────────────────────────────────────────────

async function callLLMWithRetry(
  prompt: string,
  maxRetries = 3,
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        config.LLM_API_URL,
        {
          model: config.LLM_MODEL,
          temperature: 0.4,
          max_tokens: 4000,
          messages: [
            {
              role: "system",
              content:
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
                "Do NOT give generic advice like 'write more' — be concrete.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.LLM_API_KEY}`,
          },
          timeout: 90000,
        },
      );
      return response.data?.choices?.[0]?.message?.content || "";
    } catch (error) {
      lastError = error as Error;
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status && status < 500 && status !== 429) {
        throw error;
      }
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          `[BookAnalysis] LLM API attempt ${attempt + 1} failed (status=${status}), retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("LLM API call failed after retries");
}
