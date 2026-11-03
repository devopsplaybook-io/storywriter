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
- [x] LLM calls use retry with backoff: 3 attempts total (2 retries) after 1 s and 2 s. Sleeps are abort-aware and never run past the 120-second overall deadline; once aborted or out of budget, no further attempt starts. Non-retryable responses (a defined 4xx status other than 429) fail immediately.
- [x] Timeouts: 45 seconds per request and a 120-second overall deadline enforced with an `AbortController`; aborted calls fail with the stable provider error below, and the timeout cause is logged server-side only.
- [x] **Availability status**: the server exposes whether AI is configured; the UI disables AI features with a clear explanation when no `LLM_API_KEY` is set (instead of failing with a cryptic error).
- [x] The availability check never exposes the API key and never pings the LLM provider (no token cost).
- [x] **Concurrency and quota guards**: AI endpoints run at most one request per user at a time (`LLM_USER_CONCURRENCY`). `LLM_DAILY_QUOTA` is a rolling 24-hour fixed window per user: the window starts at the first counted request, lives in process memory, resets when the server restarts and is independent per replica. Attempts are counted at admission, so failed generations also count. Exceeding either guard returns HTTP 429; the quota message is `AI request quota exceeded (rolling 24-hour window per user)`.
- [x] All AI modules log through the OTel module logger (`llm-client`, `book-analysis`, `section-analysis`), so retries and provider failures stay correlated with request traces.

## Book Analysis Input

- [x] The prompt includes the **whole book content** under a global character budget (~120,000 chars ≈ 30k tokens) instead of clipping every section to a fixed snippet.
- [x] Every non-empty section is guaranteed a minimum share of the budget (~1,000 chars); the remainder is distributed proportionally to content length.
- [x] Attributes share one global budget (~12,000 chars) carved out of that same total; every non-empty attribute is guaranteed ~500 chars, and truncated attributes are marked `(truncated, N words total)`. Section content and attribute text together never exceed the character budget.
- [x] Truncated sections are marked `(truncated, N words total)` in the prompt.
- [x] Each section line in the prompt carries its **word count**, and the statistics block reports the total word count.
- [x] Section property values are gathered with **one bulk query** for the whole book and are listed with their **real property names** (falling back to the id for undefined properties).
- [x] The section tree is built with one `parentId → children` map, sorted once, then walked linearly rather than filtering the full section list per node.

## Report Freshness & Errors

- [x] Each book carries an internal `contentVersion` that every content-bearing write bumps in the same transaction (book metadata, sections, attributes, property definitions and values, media add/update/delete, import and version restore). The cached report stores the version at generation time, so staleness is a constant-time version comparison and opening the panel never re-reads the book.
- [x] Writes that change nothing do not bump the version: no-op saves keep the report fresh.
- [x] Reports cached before `contentVersion` existed fall back to the **content hash** (sha256 over content-bearing fields only — `dateUpdated` is excluded, so revision-style saves do not flip it). A fresh legacy report is upgraded in place with the current version once; a stale one is left untouched until regenerated.
- [x] Reports cached before the hash existed fall back to the previous section `dateUpdated` comparison.
- [x] The analysis viewer shows a "book changed since this analysis was generated" hint when the report is stale.
- [x] Regeneration keeps the cached report visible under a "Regenerating analysis…" overlay; the full-screen loading state is only shown when no cached report exists.
- [x] Generation failures are surfaced as an error (HTTP 502 with `{ "error": "AI provider request failed" }`) and are **never cached as report content** — the cache keeps the last good report. Provider details (URLs, request ids, response bodies) are logged server-side and never returned to the client.

## Section-Level Analysis

- [x] Each text section has an **analysis** field holding AI-generated working notes (recap, continuity, consistency with the story bible, suggestions).
- [x] Notes are generated from the section's title and full content (same budget rule as book analysis), the book's attributes, and the section's property values with their real property names.
- [x] Generated notes are saved on the section and editable in the editor's **AI Notes** tab (see SECTIONS.md).
- [x] Notes are saved with a **targeted** `UPDATE … SET analysis = ?, revision = revision + 1` guarded by the analysis value present when generation started. A content edit made during generation is preserved, because the statement never writes title/content/caption/type; only a concurrent **notes** edit makes it fail.
- [x] When the notes changed during generation, the write is rejected with `409` and `{ error, analysis, currentAnalysis, revision }`: `analysis` is the version just generated, `currentAnalysis` is the version now stored. Nothing is overwritten; the editor dialog shows both versions and the author chooses which one to keep.

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
| [x] POST | `/api/sections/:id/analysis` | Generate AI notes for a text section (write access required; 429 when concurrency/quota exceeded; 409 with both note versions when they changed during generation) |
| [x] POST | `/api/sections/:id/ai-action`| Run an AI action (`{ action, selection? }` → `{ text }`; 429 when concurrency/quota exceeded) |

## Implementation

- [x] Server module: `src/analysis/BookAnalysis.ts` — data gathering, prompt building, LLM call, caching, version-based staleness.
- [x] Server module: `src/books/BookContentVersion.ts` — bumps the internal book content version inside the caller's transaction.
- [x] Server routes: `src/analysis/BookAnalysisRoutes.ts` — GET/POST endpoints.
- [x] Server module: `src/analysis/LlmClient.ts` — shared LLM call with retry and availability helpers.
- [x] Server routes: `src/analysis/LlmRoutes.ts` — availability status endpoint.
- [x] Server module: `src/analysis/SectionAnalysis.ts` — section notes generation and AI actions.
- [x] Web store: `books.ts` — `fetchAnalysis()` and `analyzeBook()` actions.
- [x] Web store: `llm.ts` — availability status (`fetchStatus()`).
- [x] Web UI: analysis panel with availability state, regeneration overlay and stale hint in `components/AnalysisViewer.vue`.
- [x] Web UI: AI Notes tab and AI actions menu in `components/SectionEditor.vue`, markdown rendering via `marked`.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-11-03_
