import { FastifyReply } from "fastify";

/**
 * Per-file Cache-Control policy for the static SPA assets:
 * - HTML (including index.html) is always revalidated with the ETag so a
 *   deployment can never serve a stale SPA shell from cache;
 * - hashed build assets (/_nuxt/...) are immutable and cacheable for a year;
 * - everything else (icons, manifest, service worker) gets a short max-age.
 */
export function StaticCacheControl(
  reply: FastifyReply,
  filepath: string,
): void {
  // Routes that set their own policy (e.g. private media: no-store) keep it.
  if (reply.hasHeader("Cache-Control")) {
    return;
  }
  if (filepath.endsWith(".html")) {
    reply.header("Cache-Control", "no-cache");
    return;
  }
  if (filepath.includes(`_nuxt`)) {
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  reply.header("Cache-Control", "public, max-age=3600");
}
