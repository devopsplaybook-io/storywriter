// Word counting from markdown text, used for per-section counts and the
// per-book writing goal. Counts are approximations for writers, not parsers:
// the goal is feedback ("am I progressing?"), not exact tokenization.

export interface SectionLike {
  id: string;
  content: string;
}

export function stripMarkdown(md: string): string {
  let text = md;
  // Fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/~~~[\s\S]*?~~~/g, " ");
  // Images: drop entirely (no textual contribution)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, " ");
  // Links: keep the link text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Inline code
  text = text.replace(/`([^`]*)`/g, " ");
  // HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Headings, blockquotes and list markers
  text = text.replace(/^\s{0,3}(#{1,6})\s+/gm, " ");
  text = text.replace(/^\s{0,3}>\s?/gm, " ");
  text = text.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, " ");
  // Emphasis markers (bold/italic/strikethrough/highlight)
  text = text.replace(/(\*\*|__|\*|_|~~|==)/g, " ");
  return text;
}

export function countWords(text: string): number {
  if (!text) return 0;
  const stripped = stripMarkdown(text).trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

export function countBookWords(
  sections: SectionLike[],
  liveContent?: Record<string, string>,
): number {
  return sections.reduce((total, section) => {
    const content = liveContent?.[section.id] ?? section.content;
    return total + countWords(content);
  }, 0);
}
