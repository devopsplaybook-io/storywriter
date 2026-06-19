# Technologies

## Server Side

- [x] **Runtime**: Node.js
- [x] **Framework**: Fastify (HTTP API)
- [x] **Database**: SQLite via `better-sqlite3` (default), with optional PostgreSQL support
- [x] **Language**: TypeScript
- [x] **Build**: `tsc` (compiles `src/` to `dist/`)
- [x] **Dev mode**: `ts-node-dev` (hot-reload)
- [x] **Tests**: Jest with `ts-jest`
- [x] **Linting**: ESLint with `typescript-eslint`
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
- [x] **Markdown rendering**: `marked` library for markdown preview in editors
- [x] **Design Language**: CSS custom properties for spacing, radius, transitions, typography (defined in `assets/css/main.css`)
- [x] **Theme**: Light/dark theme toggle with system preference detection; choice saved to localStorage

## Proxy

- [x] **Traefik** for local development reverse proxy
- [x] Routes: web UI and API through a single entry point
- [x] Only used in development; production uses the all-in-one container

## Docker

- [x] Multi-stage build: builder stage compiles server + generates web, runtime stage uses `node:alpine`
- [x] Single container serves both API and static web files
- [x] `pm2` process management via `ecosystem.config.js`

## CI/CD

- [x] GitHub Actions workflows reusing shared workflows from `devopsplaybook-io/common-utils`
- [x] On push to `main`: build, lint, test, then build & push multi-arch Docker image
- [x] On PR to `main`: build, lint, test, then build & push a `beta` Docker image

## LLM Integration

- [x] OpenAI-compatible chat completions API (DeepSeek, OpenAI, etc.)
- [x] Config: `LLM_API_KEY`, `LLM_API_URL` (default: DeepSeek), `LLM_MODEL` (default: `deepseek-chat`)
- [x] Used for book analysis feature (`src/analysis/`)
- [x] Retry with exponential backoff; results cached to disk

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
