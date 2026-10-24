import { beforeAll, describe, expect, it } from "vitest";

interface RuntimeCachingRule {
  urlPattern: RegExp | string;
  handler?: string;
  options?: { cacheName?: string };
}

function ruleMatches(rule: RuntimeCachingRule, url: string): boolean {
  const pattern = rule.urlPattern;
  if (pattern instanceof RegExp) return pattern.test(url);
  if (typeof pattern === "string") {
    return url === pattern || url.includes(pattern);
  }
  return false;
}

describe("nuxt.config service worker runtime caching", () => {
  let runtimeCaching: RuntimeCachingRule[];
  let appHead: { charset?: string };

  beforeAll(async () => {
    // nuxt.config.ts calls the Nuxt global; stub it for the plain import
    (globalThis as Record<string, unknown>).defineNuxtConfig ??= (
      config: unknown,
    ) => config;
    const config = (await import("../nuxt.config")).default as {
      app: { head: { charset?: string } };
      pwa: { workbox: { runtimeCaching: RuntimeCachingRule[] } };
    };
    runtimeCaching = config.pwa?.workbox?.runtimeCaching ?? [];
    appHead = config.app?.head ?? {};
  });

  it("declares the utf-8 charset (matching the HTTP response)", () => {
    expect(appHead.charset).toBe("utf-8");
  });

  it("never caches API responses (including private media)", () => {
    const apiUrls = [
      "/api/status",
      "/api/books/b1/media/m1/file",
      "/api/books/b1/media/m1/file?token=abc",
      "/api/sections/root?bookId=b1",
    ];
    for (const rule of runtimeCaching) {
      for (const url of apiUrls) {
        expect(ruleMatches(rule, url)).toBe(false);
      }
    }
  });

  it("keeps the old tokenized media cache rule removed", () => {
    for (const rule of runtimeCaching) {
      expect(rule.options?.cacheName).not.toBe("media-files");
      expect(String(rule.urlPattern)).not.toContain("/api/books");
    }
  });

  it("still caches hashed build assets with a pattern that excludes APIs", () => {
    const staticRule = runtimeCaching.find((rule) =>
      ruleMatches(rule, "/_nuxt/entry.abc123.png"),
    );
    expect(staticRule).toBeDefined();
    expect(staticRule?.handler).toBe("CacheFirst");
    // The pattern is the only guard (workbox's generateSW has no denylist
    // option): it must only ever match /_nuxt/ asset paths
    expect(String(staticRule?.urlPattern)).toContain("_nuxt");
  });
});
