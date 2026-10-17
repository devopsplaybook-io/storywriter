import { describe, expect, it } from "vitest";
import {
  buildSnippet,
  searchSections,
} from "../utils/bookSearch";

const sections = [
  {
    id: "s1",
    title: "The Dark Forest",
    content: "It was a dark and stormy night when the letter arrived.",
    caption: "",
  },
  {
    id: "s2",
    title: "Morning",
    content: "Coffee first. Then the DARK room develops.",
    caption: "a darkroom print",
  },
  {
    id: "s3",
    title: "Untitled",
    content: "Nothing to see here.",
    caption: "",
  },
];

describe("searchSections", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(searchSections(sections, "")).toEqual([]);
    expect(searchSections(sections, "   ")).toEqual([]);
  });

  it("matches titles case-insensitively", () => {
    const results = searchSections(sections, "dark forest");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("s1");
    expect(results[0].where).toBe("title");
  });

  it("matches content case-insensitively", () => {
    const results = searchSections(sections, "dark");
    expect(results.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(results[0].where).toBe("title");
    expect(results[1].where).toBe("content");
  });

  it("matches captions when title and content do not match", () => {
    const results = searchSections(sections, "darkroom");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("s2");
    expect(results[0].where).toBe("caption");
  });

  it("produces snippets around the first match", () => {
    const results = searchSections(sections, "stormy");
    expect(results[0].snippet).toContain("stormy");
  });

  it("returns no results when nothing matches", () => {
    expect(searchSections(sections, "zebra")).toEqual([]);
  });
});

describe("buildSnippet", () => {
  it("adds ellipses when trimmed on both sides", () => {
    const text = "0123456789".repeat(20);
    const snippet = buildSnippet(text, 100, 2);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("does not add ellipses when the match fits", () => {
    expect(buildSnippet("short text", 6, 4)).toBe("short text");
  });

  it("collapses newlines into spaces", () => {
    expect(buildSnippet("line one\nline two", 9, 4)).toBe(
      "line one line two",
    );
  });
});
