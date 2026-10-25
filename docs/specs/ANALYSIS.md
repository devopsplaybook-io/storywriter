# Book Analysis

LLM-powered book analysis provides AI-generated insights on structure, content quality, and writing suggestions.

## Feature

- [x] **Analyze Book** button (lightbulb icon) in the book detail sidebar header.
- [x] On click, the server gathers all book data (metadata, sections tree, attributes, properties) and sends it to an LLM.
- [x] The LLM returns a structured report with four sections: Summary, Strengths, Areas for Improvement, Suggestions.
- [x] Results are displayed in a dialog with markdown rendering.
- [x] Results are cached to disk (`{DATA_DIR}/book-analysis-{bookId}.json`) and loaded automatically on next visit.
- [x] A regenerate button allows re-running the analysis.
- [x] Requires **write access** on the book to generate analysis; read access is sufficient to view cached results.

## LLM Integration

- [x] Uses any OpenAI-compatible chat completions API (DeepSeek, OpenAI, etc.).
- [x] Configured via `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL` in `config.json` or environment variables.
- [x] Defaults: `LLM_API_URL=https://api.deepseek.com/chat/completions`, `LLM_MODEL=deepseek-chat`.
- [x] LLM calls use retry with exponential backoff (2 retries, 1s/2s/4s delays).
- [x] Timeouts: 45 seconds per request and a 120-second overall deadline enforced with an `AbortController`; aborted calls surface a clear timeout error.
- [x] **Availability status**: the server exposes whether AI is configured; the UI disables AI features with a clear explanation when no `LLM_API_KEY` is set (instead of failing with a cryptic error).
- [x] The availability check never exposes the API key and never pings the LLM provider (no token cost).
- [x] **Concurrency and quota guards**: AI endpoints run at most one request per user at a time and cap the number of AI requests per user per day (`LLM_USER_CONCURRENCY`, `LLM_DAILY_QUOTA`); exceeding either returns HTTP 429 with a clear message.

## Book Analysis Input

- [x] The prompt includes the **whole book content** under a global character budget (~120,000 chars ≈ 30k tokens) instead of clipping every section to a fixed snippet.
- [x] Every non-empty section is guaranteed a minimum share of the budget (~1,000 chars); the remainder is distributed proportionally to content length.
- [x] Truncated sections are marked `(truncated, N words total)` in the prompt.
- [x] Each section line in the prompt carries its **word count**, and the statistics block reports the total word count.
- [x] Section property values are gathered with **one bulk query** for the whole book and are listed with their **real property names** (falling back to the id for undefined properties).

## Report Freshness & Errors

- [x] The cached report carries a **content hash** (sha256 over every content-bearing record: book metadata, sections, attributes, property definitions, property values, media). The report is stale when the recomputed hash differs — so any change to any of those records invalidates it, while non-content changes (e.g. a revision bump) do not.
- [x] Reports cached before the hash existed fall back to the previous section `dateUpdated` comparison.
- [x] The analysis viewer shows a "book changed since this analysis was generated" hint when the report is stale.
- [x] Regeneration keeps the cached report visible under a "Regenerating analysis…" overlay; the full-screen loading state is only shown when no cached report exists.
- [x] Generation failures are surfaced as errors (HTTP 502 with the message) and are **never cached as report content** — the cache keeps the last good report.

## Section-Level Analysis

- [x] Each text section has an **analysis** field holding AI-generated working notes (recap, continuity, consistency with the story bible, suggestions).
- [x] Notes are generated from the section's title and full content (same budget rule as book analysis), the book's attributes, and the section's property values with their real property names.
- [x] Generated notes are saved on the section and editable in the editor's **AI Notes** tab (see SECTIONS.md).

## In-Editor AI Actions

- [x] Explicit user-invoked actions on a text section: **Continue**, **Summarize**, **Improve** and **Brainstorm**.
- [x] Actions use the book's attributes (story bible) as context; **Improve** rewrites the current selection when one exists, otherwise the whole content.
- [x] Actions return text only and write nothing by themselves — the user chooses to insert the result at the cursor, save it to the AI notes, or discard it.

## API Endpoints

| Method   | Endpoint                     | Description                                                       |
| -------- | ---------------------------- | ----------------------------------------------------------------- |
| [x] GET  | `/api/llm/status`            | LLM availability `{ available, model }` (auth required)           |
| [x] GET  | `/api/books/:id/analysis`    | Return cached analysis (or null) with `stale` flag (read access required) |
| [x] POST | `/api/books/:id/analysis`    | Generate a new analysis (write access required; 502 on failure; 429 when concurrency/quota exceeded) |
| [x] POST | `/api/sections/:id/analysis` | Generate AI notes for a text section (write access required; 429 when concurrency/quota exceeded) |
| [x] POST | `/api/sections/:id/ai-action`| Run an AI action (`{ action, selection? }` → `{ text }`; 429 when concurrency/quota exceeded) |

## Implementation

- [x] Server module: `src/analysis/BookAnalysis.ts` — data gathering, prompt building, LLM call, caching.
- [x] Server routes: `src/analysis/BookAnalysisRoutes.ts` — GET/POST endpoints.
- [x] Server module: `src/analysis/LlmClient.ts` — shared LLM call with retry and availability helpers.
- [x] Server routes: `src/analysis/LlmRoutes.ts` — availability status endpoint.
- [x] Server module: `src/analysis/SectionAnalysis.ts` — section notes generation and AI actions.
- [x] Web store: `books.ts` — `fetchAnalysis()` and `analyzeBook()` actions.
- [x] Web store: `llm.ts` — availability status (`fetchStatus()`).
- [x] Web UI: analysis panel with availability state, regeneration overlay and stale hint in `components/AnalysisViewer.vue`.
- [x] Web UI: AI Notes tab and AI actions menu in `components/SectionEditor.vue`, markdown rendering via `marked`.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-25_
