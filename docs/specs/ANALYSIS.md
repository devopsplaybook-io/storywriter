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
- [x] LLM calls use retry with exponential backoff (3 attempts, 1s/2s/4s delays).
- [x] Timeout: 90 seconds per request.

## API Endpoints

| Method   | Endpoint                  | Description                                     |
| -------- | ------------------------- | ----------------------------------------------- |
| [x] GET  | `/api/books/:id/analysis` | Return cached analysis (or null)                |
| [x] POST | `/api/books/:id/analysis` | Generate a new analysis (write access required) |

## Implementation

- [x] Server module: `src/analysis/BookAnalysis.ts` — data gathering, prompt building, LLM call, caching.
- [x] Server routes: `src/analysis/BookAnalysisRoutes.ts` — GET/POST endpoints.
- [x] Web store: `books.ts` — `fetchAnalysis()` and `analyzeBook()` actions.
- [x] Web UI: button + dialog in `pages/books/[id].vue`, markdown rendering via `marked`.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
