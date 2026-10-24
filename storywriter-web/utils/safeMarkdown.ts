import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Markdown rendering for every user-supplied or AI-generated content that is
 * injected with v-html. `marked` output is always passed through DOMPurify
 * with an explicit allow-list, so raw HTML in stored content can never
 * execute script (see the XSS findings in the security review).
 */

export type MediaSlugResolver = (
  bookId: string,
  slug: string,
) => { id: string } | null;

export interface RenderMarkdownOptions {
  bookId?: string;
  resolveMediaSlug?: MediaSlugResolver;
}

/** Matches the tokenless media file URLs emitted for resolved media slugs. */
export const MEDIA_FILE_URL_PATTERN =
  /^\/api\/books\/([^/]+)\/media\/([^/]+)\/file$/;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "del",
    "s",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "span",
    "figure",
    "figcaption",
  ],
  // Array form (DOMPurify's object form drops allowed attributes); harmless
  // presentation-only attributes apply to all tags
  ALLOWED_ATTR: [
    "href",
    "title",
    "target",
    "rel",
    "src",
    "alt",
    "align",
    "start",
    "class",
  ],
  ALLOW_DATA_ATTR: false,
};

let hooksInstalled = false;

function ensureHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export function renderMarkdown(
  content: string,
  opts: RenderMarkdownOptions = {},
): string {
  if (!content) return "";
  const renderer = new marked.Renderer();
  renderer.image = ({ href, text, title }) => {
    if (!href) return "";
    const alt = escapeHtml(text || "");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    if (opts.bookId && opts.resolveMediaSlug && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      // Try to resolve as a media slug (with or without extension)
      const stripped = href.replace(/\.[^/.]+$/, "");
      const media =
        opts.resolveMediaSlug(opts.bookId, stripped) ||
        opts.resolveMediaSlug(opts.bookId, href);
      if (media) {
        return `<img src="/api/books/${escapeHtml(opts.bookId)}/media/${escapeHtml(media.id)}/file" alt="${alt}"${titleAttr} />`;
      }
    }
    // Unresolved or absolute URLs: escape every interpolated value
    return `<img src="${escapeHtml(href)}" alt="${alt}"${titleAttr} />`;
  };
  const html = marked.parse(content, {
    breaks: true,
    gfm: true,
    renderer,
  }) as string;
  ensureHooks();
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
