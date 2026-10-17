// Client-side book-wide search. All sections (with content) are already in
// the client store, so search is a pure function over them.

export interface SearchableSection {
  id: string;
  title: string;
  content: string;
  caption: string;
}

export interface SearchResult {
  id: string;
  title: string;
  where: "title" | "content" | "caption";
  snippet: string;
}

const SNIPPET_CONTEXT = 40;
const MAX_RESULTS = 50;

export function buildSnippet(
  text: string,
  matchIndex: number,
  matchLength: number,
): string {
  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT);
  const end = Math.min(
    text.length,
    matchIndex + matchLength + SNIPPET_CONTEXT,
  );
  const raw = text.slice(start, end);
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${collapsed}${suffix}`;
}

function firstMatchIndex(
  haystack: string,
  query: string,
): { index: number; length: number } | null {
  if (!haystack) return null;
  const index = haystack.toLowerCase().indexOf(query);
  if (index < 0) return null;
  return { index, length: query.length };
}

export function searchSections(
  sections: SearchableSection[],
  query: string,
): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const results: SearchResult[] = [];
  for (const section of sections) {
    const inTitle = firstMatchIndex(section.title, trimmed);
    const inContent = inTitle ? null : firstMatchIndex(section.content, trimmed);
    const inCaption =
      inTitle || inContent ? null : firstMatchIndex(section.caption, trimmed);
    if (inTitle) {
      results.push({
        id: section.id,
        title: section.title,
        where: "title",
        snippet: buildSnippet(section.title, inTitle.index, inTitle.length),
      });
    } else if (inContent) {
      results.push({
        id: section.id,
        title: section.title,
        where: "content",
        snippet: buildSnippet(
          section.content,
          inContent.index,
          inContent.length,
        ),
      });
    } else if (inCaption) {
      results.push({
        id: section.id,
        title: section.title,
        where: "caption",
        snippet: buildSnippet(
          section.caption,
          inCaption.index,
          inCaption.length,
        ),
      });
    }
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}
