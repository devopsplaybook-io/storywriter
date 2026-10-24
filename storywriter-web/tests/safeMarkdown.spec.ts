// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MEDIA_FILE_URL_PATTERN, renderMarkdown } from "../utils/safeMarkdown";

/** Parse rendered HTML and assert it contains no executable payload. */
function sanitizedInto(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.querySelectorAll("script").length).toBe(0);
  expect(container.querySelectorAll("[onerror]").length).toBe(0);
  expect(container.querySelectorAll("iframe,embed,object,form").length).toBe(0);
  return container;
}

describe("renderMarkdown sanitization", () => {
  it("renders allow-listed markdown structure", () => {
    const html = renderMarkdown("# Hello\n\n**bold** and _italic_");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("strips script tags from stored content", () => {
    const html = renderMarkdown(
      'before\n\n<script>window.__pwnedScript = 1</script>\n\nafter',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.__pwnedScript");
    expect(html).toContain("after");
  });

  it("renders <img src=x onerror=...> inert (no event handlers survive)", () => {
    const html = renderMarkdown('<img src=x onerror="window.__pwned = 1">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("__pwned");
    expect(html).toContain("<img");
  });

  it("strips javascript: links", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click me");
  });

  it("strips iframes and embeds", () => {
    const html = renderMarkdown(
      '<iframe src="https://evil.example"></iframe><embed src="x"><object data="x"></object>',
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<embed");
    expect(html).not.toContain("<object");
  });

  it("strips data attributes and unknown elements", () => {
    const html = renderMarkdown(
      '<p data-x="1" onclick="alert(1)">hello</p><form action="/steal"><input type="text"></form>',
    );
    expect(html).not.toContain("data-x");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("escapes attribute injection through image alt text", () => {
    const container = sanitizedInto(
      renderMarkdown('!["></p><script>alert(1)</script>](pic.png)'),
    );
    // The payload stays inert: exactly one img with untouched src and no
    // markup breaking out of the attribute (DOMPurify may drop the alt
    // entirely if its value could form an element — that is fine too)
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("pic.png");
    expect(container.querySelector("p")?.childElementCount).toBe(1);
  });

  it("escapes attribute injection through image href", () => {
    const container = sanitizedInto(
      renderMarkdown('![x](https://evil.example/a.png" onerror="alert(1))'),
    );
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("forces rel=noopener noreferrer on target=_blank links", () => {
    const html = renderMarkdown(
      '<a href="https://example.com" target="_blank">site</a>',
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("renderMarkdown media resolution", () => {
  it("resolves a media slug to a tokenless media file URL", () => {
    const html = renderMarkdown("![pic](my-slug.png)", {
      bookId: "b1",
      resolveMediaSlug: (bookId, slug) =>
        bookId === "b1" && slug === "my-slug" ? { id: "m1" } : null,
    });
    expect(html).toContain('src="/api/books/b1/media/m1/file"');
    expect(html).not.toContain("token=");
    expect(html).toContain('alt="pic"');
  });

  it("resolves a slug without extension", () => {
    const html = renderMarkdown("![pic](my-slug)", {
      bookId: "b1",
      resolveMediaSlug: (_bookId, slug) => (slug === "my-slug" ? { id: "m2" } : null),
    });
    expect(html).toContain('src="/api/books/b1/media/m2/file"');
  });

  it("keeps unresolved relative hrefs but escapes them", () => {
    const html = renderMarkdown("![pic](missing.png)", {
      bookId: "b1",
      resolveMediaSlug: () => null,
    });
    expect(html).toContain('src="missing.png"');
    expect(html).not.toContain("token=");
  });

  it("keeps absolute http(s) URLs escaped", () => {
    const html = renderMarkdown('![pic](https://example.com/x.png "Title")', {
      bookId: "b1",
      resolveMediaSlug: () => null,
    });
    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).toContain('title="Title"');
  });

  it("never resolves a slug when no book context is given", () => {
    const html = renderMarkdown("![pic](my-slug)");
    expect(html).not.toContain("/api/books/");
    expect(html).toContain('src="my-slug"');
  });

  it("returns an empty string for empty content", () => {
    expect(renderMarkdown("")).toBe("");
  });
});

describe("MEDIA_FILE_URL_PATTERN", () => {
  it("matches tokenless media file URLs and captures ids", () => {
    const match = "/api/books/b1/media/m1/file".match(MEDIA_FILE_URL_PATTERN);
    expect(match?.[1]).toBe("b1");
    expect(match?.[2]).toBe("m1");
  });

  it("does not match other API routes or tokenized URLs", () => {
    expect(MEDIA_FILE_URL_PATTERN.test("/api/books/b1/media")).toBe(false);
    expect(MEDIA_FILE_URL_PATTERN.test("/api/books/b1/media/m1")).toBe(false);
    expect(
      MEDIA_FILE_URL_PATTERN.test("/api/books/b1/media/m1/file?token=abc"),
    ).toBe(false);
  });
});
