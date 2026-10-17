import { describe, expect, it } from "vitest";
import {
  countBookWords,
  countWords,
  stripMarkdown,
} from "../utils/wordCount";

describe("stripMarkdown", () => {
  it("removes fenced code blocks", () => {
    expect(stripMarkdown("before\n```js\nconst x = 1;\n```\nafter")).toBe(
      "before\n \nafter",
    );
  });

  it("removes inline code", () => {
    expect(stripMarkdown("run `npm test` now")).toBe("run   now");
  });

  it("drops images entirely", () => {
    expect(stripMarkdown("look ![alt text](img.png) here")).toBe(
      "look   here",
    );
  });

  it("keeps link text only", () => {
    expect(stripMarkdown("see [the docs](https://example.com)")).toBe(
      "see the docs",
    );
  });

  it("removes heading, quote and list markers", () => {
    expect(stripMarkdown("# Title\n## Sub")).toBe(" Title\n Sub");
    expect(stripMarkdown("> quoted line")).toBe(" quoted line");
    expect(stripMarkdown("- item one\n1. item two")).toBe(
      " item one\n item two",
    );
  });

  it("removes emphasis markers", () => {
    expect(stripMarkdown("**bold** and *italic* and ~~gone~~")).toBe(
      " bold  and  italic  and  gone ",
    );
  });

  it("removes HTML tags", () => {
    expect(stripMarkdown("hello <b>world</b>")).toBe("hello  world ");
  });

  it("leaves plain text untouched", () => {
    expect(stripMarkdown("just plain words here")).toBe(
      "just plain words here",
    );
  });
});

describe("countWords", () => {
  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts whitespace-separated words of plain text", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("line one\nline two")).toBe(4);
  });

  it("does not count markdown syntax as words", () => {
    expect(countWords("## Heading")).toBe(1);
    expect(countWords("**bold** statement")).toBe(2);
    expect(countWords("[link](https://example.com)")).toBe(1);
    expect(countWords("```js\nconst a = 1;\n```")).toBe(0);
  });

  it("counts the words inside links but not their urls", () => {
    expect(countWords("read [the user guide](url) today")).toBe(5);
  });
});

describe("countBookWords", () => {
  const sections = [
    { id: "s1", content: "one two three" },
    { id: "s2", content: "four five" },
    { id: "s3", content: "" },
  ];

  it("sums word counts across sections", () => {
    expect(countBookWords(sections)).toBe(5);
  });

  it("prefers live (unsaved) content over stored content", () => {
    expect(
      countBookWords(sections, { s1: "completely different words here" }),
    ).toBe(6);
    expect(countBookWords(sections, { s3: "brand new" })).toBe(7);
  });

  it("returns 0 for no sections", () => {
    expect(countBookWords([])).toBe(0);
  });
});
