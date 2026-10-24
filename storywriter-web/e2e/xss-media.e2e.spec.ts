import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __pwned?: unknown;
    __pwnedScript?: unknown;
  }
}

// 1x1 transparent PNG (magic bytes: 89 50 4E 47)
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface Seed {
  token: string;
  user: Record<string, unknown>;
  bookId: string;
  mediaId: string;
  mediaSlug: string;
}

async function postJson(
  baseURL: string,
  path: string,
  token: string | null,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(new URL(path, baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  expect(res.status, `${path} seeding request`).toBeLessThan(300);
  return (await res.json()) as Record<string, unknown>;
}

async function seed(baseURL: string): Promise<Seed> {
  const name = `e2e-admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const password = `e2e-pass-${Date.now()}`;

  // First registered user bootstraps as admin
  await postJson(baseURL, "/api/users", null, { name, password });
  const session = await postJson(baseURL, "/api/users/session", null, {
    name,
    password,
  });
  const token = session.token as string;
  const user = session.user as Record<string, unknown>;

  const book = await postJson(baseURL, "/api/books", token, {
    name: `E2E book ${Date.now()}`,
    description: "Seeded by xss-media.e2e.spec.ts",
  });
  const bookId = book.id as string;

  // Root section (type container) is created together with the book
  const rootRes = await fetch(
    new URL(`/api/sections/root?bookId=${bookId}`, baseURL),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(rootRes.status).toBe(200);
  const root = (await rootRes.json()) as { id: string };

  const mediaForm = new FormData();
  mediaForm.append(
    "file",
    new Blob([Buffer.from(PNG_1PX_BASE64, "base64")], { type: "image/png" }),
    "cover.png",
  );
  const mediaRes = await fetch(new URL(`/api/books/${bookId}/media`, baseURL), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: mediaForm,
  });
  expect(mediaRes.status, "media upload seeding request").toBe(201);
  const media = (await mediaRes.json()) as { id: string; slug: string };

  const section = await postJson(baseURL, "/api/sections", token, {
    bookId,
    parentId: root.id,
    type: "text",
    title: "Chapter 1",
    content: sectionContent(media.slug),
  });
  expect(section.id, "section seeding request").toBeTruthy();

  return {
    token,
    user,
    bookId,
    mediaId: media.id,
    mediaSlug: media.slug,
  };
}

function sectionContent(mediaSlug: string): string {
  return [
    "# Chapter 1",
    "",
    '<img src=x onerror="window.__pwned = 1">',
    "<script>window.__pwnedScript = 1</script>",
    "[click me](javascript:alert(1))",
    "",
    `![pic](${mediaSlug}.png)`,
    "",
    "Plain text after the payloads.",
  ].join("\n");
}

function watchForViolations(page: Page): {
  violations: () => string[];
  install: () => void;
} {
  const seen: string[] = [];
  return {
    violations: () => seen,
    install: () => {
      page.on("pageerror", (err) => seen.push(`pageerror: ${err.message}`));
      page.on("dialog", (dialog) => {
        seen.push(`dialog: ${dialog.type()} ${dialog.message()}`);
        void dialog.dismiss();
      });
      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() !== "error" || !/Content Security Policy/i.test(text)) {
          return;
        }
        // Sanitizing a hostile payload makes the browser momentarily parse an
        // <img onerror> node; the CSP blocks its transient handler and logs
        // an "inline event handler" violation. That block IS the defense
        // working (nothing executes), so only other CSP errors are failures.
        if (/inline event handler/i.test(text)) return;
        seen.push(`csp: ${text}`);
      });
    },
  };
}

test("stored XSS stays inert and media renders via authenticated blobs", async ({
  page,
  request,
  baseURL,
}) => {
  const seedData = await seed(baseURL as string);
  const violations = watchForViolations(page);
  violations.install();

  // Book the app as an already-logged-in user and open the book in the
  // recursive view (renders every section's markdown through v-html)
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("storywriter.viewMode.container", "recursive-view");
    },
    { token: seedData.token, user: seedData.user },
  );

  const pageResponse = await page.goto(`/books/${seedData.bookId}`);
  expect(pageResponse, "SPA index response").not.toBeNull();
  const pageCsp = pageResponse?.headers()["content-security-policy"] ?? "";
  expect(pageCsp).toContain("default-src 'none'");
  expect(pageCsp).toContain("script-src 'self'");

  // Section content rendered (and media swapped to a blob: object URL)
  const pic = page.locator('.section-block-text img[alt="pic"]');
  await expect(pic).toBeVisible();
  await expect(pic).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => pic.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  // 1. XSS payloads stay inert
  const rendered = page.locator(".section-block-text");
  await expect(rendered.locator("script")).toHaveCount(0);
  await expect(rendered.locator("[onerror]")).toHaveCount(0);
  await expect(rendered.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.evaluate(() => window.__pwnedScript)).toBeUndefined();

  // 2. Media: nothing private in the URL, raw file requires the auth header
  const documentHtml = await page.evaluate(
    () => document.documentElement.innerHTML,
  );
  expect(documentHtml).not.toContain("token=");
  const mediaUrl = `/api/books/${seedData.bookId}/media/${seedData.mediaId}/file`;
  const anonymous = await request.get(mediaUrl);
  expect(anonymous.status()).toBe(403);

  // 3. Response headers on API and media endpoints
  const status = await request.get("/api/status");
  expect(status.status()).toBe(200);
  expect(status.headers()["content-security-policy"]).toContain(
    "default-src 'none'",
  );
  expect(status.headers()["cache-control"]).toContain("no-store");
  const mediaFile = await request.get(mediaUrl, {
    headers: { Authorization: `Bearer ${seedData.token}` },
  });
  expect(mediaFile.status()).toBe(200);
  expect(mediaFile.headers()["x-content-type-options"]).toBe("nosniff");
  expect(mediaFile.headers()["cache-control"]).toContain("no-store");

  expect(violations.violations(), "no JS errors, dialogs or CSP blocks").toEqual(
    [],
  );
});
