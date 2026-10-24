import * as crypto from "crypto";
import * as fs from "fs";
import { FastifyInstance } from "fastify";
import * as path from "path";

/**
 * Strict Content Security Policy for the SPA and API served by this app.
 * The Nuxt SPA build does emit a few framework-owned inline scripts in
 * index.html (import map, runtime config bootstrap), so `script-src` is
 * extended at startup with the sha256 hashes of exactly those scripts
 * (see InlineScriptHashes) — no `unsafe-inline` for scripts, ever.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Extract the inline scripts of the built SPA index.html and return their
 * CSP sha256 hashes. Only executable scripts are hashed: external ones are
 * covered by 'self' and data blocks (e.g. type="application/json") are never
 * executed. If index.html cannot be read, no hashes are added — the CSP stays
 * strict and the browser e2e suite fails loudly on a broken SPA boot.
 */
export function InlineScriptHashes(webDir: string): string[] {
  let html: string;
  try {
    html = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
  } catch {
    return [];
  }
  const hashes = new Set<string>();
  const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptTag.exec(html))) {
    const attrs = match[1];
    const body = match[2];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "importmap") continue;
    if (!body.trim()) continue;
    const digest = crypto
      .createHash("sha256")
      .update(body, "utf8")
      .digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
  return [...hashes];
}

export function RegisterSecurityHeaders(
  fastify: FastifyInstance,
  webDir?: string,
): void {
  const scriptHashes = webDir ? InlineScriptHashes(webDir) : [];
  const csp = scriptHashes.length
    ? CONTENT_SECURITY_POLICY.replace(
        "script-src 'self'",
        `script-src 'self' ${scriptHashes.join(" ")}`,
      )
    : CONTENT_SECURITY_POLICY;
  fastify.addHook("onSend", async (request, reply) => {
    reply.header("Content-Security-Policy", csp);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    // API data responses are never cached (see USER_INTERFACE spec); routes
    // that already set a stricter value (media: private, no-store) keep it.
    if (
      request.raw.url &&
      request.raw.url.startsWith("/api/") &&
      !reply.hasHeader("Cache-Control")
    ) {
      reply.header("Cache-Control", "no-store");
    }
  });
}
