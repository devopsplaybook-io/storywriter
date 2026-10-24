#!/usr/bin/env bash
# Assemble the all-in-one app exactly like the Dockerfile and start the server.
# Used by Playwright (playwright.config.ts webServer) so the e2e suite runs
# against the production SPA bundle served by the real Fastify server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$ROOT/storywriter-server"
WEB_DIR="$ROOT/storywriter-web"

# 1. Web bundle: reuse the production build when present (CI runs
#    `npm run build` just before the tests), otherwise generate it.
if [ ! -f "$WEB_DIR/.output/public/index.html" ]; then
  echo "[e2e] building web bundle..."
  (cd "$WEB_DIR" && npm run generate)
fi

# 2. Server build (the CI web job only builds storywriter-web).
if [ ! -f "$SERVER_DIR/dist/App.js" ]; then
  echo "[e2e] building server..."
  (cd "$SERVER_DIR" && npm ci && npm run build)
fi

# 3. Assemble the runtime layout expected by dist/App.js (../web static root).
echo "[e2e] copying web bundle to storywriter-server/web ..."
rm -rf "$SERVER_DIR/web"
mkdir -p "$SERVER_DIR/web"
cp -r "$WEB_DIR/.output/public/." "$SERVER_DIR/web/"

# 4. Start the server on a throwaway data dir.
DATA_DIR="$(mktemp -d)"
echo "[e2e] data dir: $DATA_DIR"

cd "$SERVER_DIR"
OPENTELEMETRY_COLLECTOR_HTTP_TRACES="" \
OPENTELEMETRY_COLLECTOR_HTTP_METRICS="" \
OPENTELEMETRY_COLLECTOR_HTTP_LOGS="" \
DATA_DIR="$DATA_DIR" \
API_PORT="${API_PORT:-4173}" \
exec node dist/App.js
