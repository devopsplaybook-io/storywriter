# Storywriter - Agent Instructions

## Specifications

### Spec files are the source of truth

Specifications are defined in [docs/specs/](docs/specs/). Each spec file embeds its own implementation status using inline markers:

- `[x]` = Implemented
- `[~]` = Partially implemented
- `[ ]` = Not yet implemented
- `[NEEDS CLARIFICATION: ...]` = Ambiguity that needs user input before proceeding

When starting any development task, read all spec files first. Items marked `[ ]` are what needs to be built. Items marked `[x]` are already done. Items marked `[NEEDS CLARIFICATION]` signal incomplete requirements that need user input before proceeding.

### Development workflow

#### Before starting

1. Read all spec files in `docs/specs/`
2. Identify items marked `[ ]` — these are what needs to be built
3. Identify items marked `[~]` — these are partially implemented, check what remains
4. Identify any `[NEEDS CLARIFICATION: ...]` markers — flag these to the user before proceeding
5. Review items marked `[x]` for context on existing patterns

#### During implementation

1. Build features exactly matching spec requirements
2. For each ambiguity encountered, use `[NEEDS CLARIFICATION]` to flag it rather than guessing — never make assumptions about unspecified details
3. Follow existing patterns from what is already marked `[x]`

#### After implementation

1. Change `[ ]` to `[x]` (or `[~]` for partial implementation)
2. Update the "Last spec review" date in the footer to the current date
3. Run automated checks (tests, build, lint) — see Post-Change Validation for project-specific commands
4. Verify the implementation against the relevant spec file

### How the user signals spec changes

When the user edits a spec file (adds, removes, or modifies requirements), they leave new or changed items as `[ ]`. The agents see these markers and implement them automatically.

### Anti-patterns awareness

Be aware of these common SDD anti-patterns:

- **Specification Theater**: Specs must be living documents actively used in the workflow, not static documents no one references
- **Spec-Implementation Drift**: Always update markers immediately after implementation to keep specs and code aligned
- **Implementation Detail Leakage**: Specs focus on WHAT users need, not HOW to implement it — implementation details belong in implementation plans, not specs
- **Speculative Features**: Only implement what is specified; do not add "might need" features that complicate the codebase

## Project Structure

```
storywriter/
  storywriter-proxy/       # Traefik reverse proxy (routing, dev only)
  storywriter-server/      # Fastify API server (TypeScript)
    src/                   # TypeScript source
      analysis/            # Book analysis (LLM integration)
      attributes/          # Book attributes (model, data, routes)
      books/               # Books (model, data, routes)
      media/               # Media (data, routes, file storage)
      model/               # Shared models
      properties/          # Properties (model, data, routes)
      sections/            # Sections (model, data, routes)
      users/               # Users & auth
      utils/               # Utilities
    sql/
      sqlite/              # SQLite migration scripts
      postgres/            # PostgreSQL migration scripts
    config.json            # Server configuration
  storywriter-web/         # Nuxt SPA frontend
    assets/css/            # Global styles and design tokens
    components/            # Vue components
    pages/                 # Nuxt pages
    stores/                # Pinia stores
  docs/
    dev/                   # Development scripts
    specs/                 # Application specifications (with inline [x]/[ ] status markers)
```

## Coding Conventions

### Server (`storywriter-server/`)

- **Language**: TypeScript
- **Framework**: Fastify
- **Database**: SQLite via `better-sqlite3` (with optional PostgreSQL support)
- **Libraries**: `@devopsplaybook.io/common-utils`, `@devopsplaybook.io/otel-utils-fastify`
- **Build**: `tsc` (compiles `src/` to `dist/`)
- **Dev mode**: `ts-node-dev` (hot-reload)
- **Tests**: Jest with `ts-jest`, files named `*.spec.ts` alongside source
- **Linting**: ESLint with `typescript-eslint`
- **Config**: Loaded from `config.json`, overridable via environment variables

#### Server patterns

- **Model classes**: Static `fromJson` factory, instance `toJson()` and `toTransportJson()` methods.
- **Data modules**: Exported functions with a `SQL_QUERIES` object containing `postgres` and `sqlite` variants.
- **Routes**: Class with `getRoutes(fastify: FastifyInstance)` method. Access checks via helper methods.
- **SQL migrations**: Numbered scripts (`init-NNNN.sql`) in `sql/sqlite/` and `sql/postgres/`, tracked via `metadata` table.
- **SQLite UPSERT caveat**: SQLite `?` placeholders need separate values for `DO UPDATE SET` (4 params), while PostgreSQL `$N` can reuse (3 params). Always branch on `DbUtilsGetType()`.

### Web (`storywriter-web/`)

- **Framework**: Nuxt 4 (SSR disabled, SPA mode)
- **State management**: Pinia stores in `stores/` directory (auto-imported)
- **UI library**: `@picocss/pico` for base styling, `bootstrap-icons` for icons
- **Layout preference**: **CSS Grid is strongly preferred over Flexbox** for UI layout. Use `display: grid` with `grid-template-columns`, `grid-template-areas`, etc. for page layouts, card arrangements, form sections, and any multi-column/multi-row composition. Reserve `display: flex` for simple one-dimensional alignments (e.g., centering content, inline button rows, single-axis item lists with `align-items`/`justify-content`).
- **PWA**: Enabled via `@vite-pwa/nuxt`, manifest configured in `nuxt.config.ts`
- **API calls**: Axios for HTTP requests to the backend API
- **Building**: `npx nuxi build` produces output in `.output/`

#### Web patterns

- **Component structure**: `<script setup>` with Composition API, `defineProps`/`defineEmits`.
- **Styling**: Scoped `<style>` blocks per component. Global design tokens in `assets/css/main.css`.
- **Responsive**: Media queries at `768px` breakpoint. Touch devices: always show action icons (no hover). CSS Grid layout with ID-based selectors for page layouts.
- **Markdown**: Use `marked` library for preview rendering in editors.

### Proxy (`storywriter-proxy/`)

- **Traefik** for local development reverse proxy
- Only used in development; production uses the all-in-one container

### Docker

- Multi-stage build: builder stage compiles server + generates web, runtime stage uses `node:alpine`
- Single container serves both API and static web files
- `pm2` process management via `ecosystem.config.js`

## CI/CD

GitHub Actions workflows are defined in `.github/workflows/`, reusing shared workflows from `devopsplaybook-io/common-utils`:

- **`main-build.yml`**: On push to `main`. Runs build, lint, test, then builds & pushes multi-arch Docker image to Docker Hub.
- **`pr-check.yml`**: On PR to `main`. Runs build, lint, test, then builds & pushes a `beta` Docker image.
- **`npm-upgrade.yml`**: Weekly schedule. Runs `npx npm-check-updates -u` on all npm services and creates an upgrade PR.

Secrets required in GitHub repository:

- `DOCKER_HUB_USERNAME` - Docker Hub username
- `DOCKER_HUB_ACCESS_TOKEN` - Docker Hub access token

## Post-Change Validation

Refer to the **After implementation** workflow above for the standard validation sequence. The project-specific commands for running checks are:

- **Server update**: Run `npm run test`, `npm run build`, and `npm run lint` in `storywriter-server/`.
- **Web update**: Run `npx nuxi build` in `storywriter-web/`.
