# Technologies

## Server Side

- [x] **Runtime**: Node.js
- [x] **Framework**: Fastify (HTTP API)
- [x] **Database**: SQLite via `better-sqlite3` (default), with optional PostgreSQL support
- [x] **Language**: TypeScript
- [x] **Build**: `tsc && tsc -p tsconfig.spec.json --noEmit` (compiles `src/` to `dist/`, type-checks tests)
- [x] **Dev mode**: `tsx watch` (hot-reload)
- [x] **Tests**: Jest with `@swc/jest`
- [x] **Linting**: oxlint
- [x] **Config**: Loaded from `config.json`, overridable via environment variables

### Libraries

- [x] `@devopsplaybook.io/common-utils` — shared utilities (DB, auth, logging)
- [x] `@devopsplaybook.io/otel-utils-fastify` — OpenTelemetry integration for Fastify
- [x] `bcrypt` — password hashing
- [x] `jsonwebtoken` — JWT session tokens
- [x] `uuid` — unique ID generation
- [x] `axios` — HTTP client for LLM API calls

## Web Side

- [x] **Framework**: Nuxt 4 (SPA mode, SSR disabled)
- [x] **Language**: Vue 3 / TypeScript
- [x] **State management**: Pinia stores in `stores/` directory (auto-imported)
- [x] **UI library**: `@picocss/pico` for base styling, `bootstrap-icons` for icons
- [x] **Layout preference**: CSS Grid strongly preferred for layout; Flexbox for simple one-dimensional alignment
- [x] **PWA**: Enabled via `@vite-pwa/nuxt`, manifest configured in `nuxt.config.ts`
- [x] **HTTP client**: Axios for HTTP requests to the backend API
- [x] **Markdown rendering**: `marked` library, always sanitized with **DOMPurify** (allow-list) before HTML injection
- [x] **Browser e2e**: Playwright (chromium) against the assembled all-in-one app (`npm run test` runs unit + e2e)
- [x] **Design Language**: CSS custom properties for spacing, radius, transitions, typography (defined in `assets/css/main.css`)
- [x] **Theme**: Light/dark theme toggle with system preference detection; choice saved to localStorage

## Proxy

- [x] **Traefik** for local development reverse proxy
- [x] Routes: web UI and API through a single entry point
- [x] Only used in development; production uses the all-in-one container

## Docker

- [x] Multi-stage build: builder stage compiles server + generates web (and prunes dev dependencies), runtime stage uses `node:alpine`
- [x] Single container serves both API and static web files
- [x] `pm2` process management via `ecosystem.config.js`
- [x] **Non-root runtime**: the container runs as the unprivileged `storywriter` user (uid/gid 1000); deployments must give that group write access to the `/data` volume (e.g. pod-level `fsGroup: 1000`)
- [x] `HEALTHCHECK` probing `GET /api/status` every 30s

## Reliability

- [x] **Graceful shutdown**: SIGTERM/SIGINT stop accepting new connections and close the server cleanly (with a 10s force-exit timer)
- [x] **Rate limiting**: per-IP fixed-window throttle on login attempts (default 10 per 5 minutes; `429` with `Retry-After`), dependency-free and in-process (`src/utils/RateLimit.ts`)
- [x] **LLM guards**: per-user concurrency (1) and per-user daily quota (100) on AI endpoints (`src/utils/RequestLimits.ts`)
- [x] **Export/import guard**: bounded concurrent exports/imports per user
- [x] **Optimistic locking**: section updates accept a `revision` and reject concurrent edits with `409` (see SECTIONS.md)
- [x] **Error-message hygiene**: route handlers return stable, user-safe error messages for unexpected failures and log the cause server-side
- [x] **Database indexes** for the hot query paths (sections by book/parent/order, access by user, attributes/properties by book, section properties, book versions; migration `init-0008`)

## CI/CD

- [x] GitHub Actions workflows reusing shared workflows from `devopsplaybook-io/common-utils`
- [x] On push to `main`: build, lint, test, then build & push multi-arch Docker image
- [x] On PR to `main`: build, lint, test, then build & push a `beta` Docker image
- [x] **Dependency audit gate**: PR and main pipelines run `npm audit` on both apps and fail on production high/critical advisories; accepted advisories are listed in `.github/audit-allowlist.json` with an expiry and a reason

## LLM Integration

- [x] OpenAI-compatible chat completions API (DeepSeek, OpenAI, etc.)
- [x] Config: `LLM_API_KEY`, `LLM_API_URL` (default: DeepSeek), `LLM_MODEL` (default: `deepseek-chat`)
- [x] Used for book analysis feature (`src/analysis/`)
- [x] Retry with exponential backoff, per-request and overall timeouts; results cached to disk
- [x] Per-user concurrency and daily-quota limits on AI endpoints (see Reliability)

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-25_
