import { describe, expect, it } from "vitest";
import {
  insertLink,
  insertPrefix,
  insertTextAtCursor,
  wrapSelection,
} from "../utils/markdownEdit";

describe("wrapSelection", () => {
  it("wraps the selected text and keeps it selected", () => {
    const result = wrapSelection("hello world", 6, 11, "**");
    expect(result.value).toBe("hello **world**");
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(13);
  });

  it("wraps with distinct before/after markers", () => {
    const result = wrapSelection("cat", 0, 3, "![", "](slug)");
    expect(result.value).toBe("![cat](slug)");
  });

  it("inserts the wrapper around the caret when nothing is selected", () => {
    const result = wrapSelection("ab", 1, 1, "*");
    expect(result.value).toBe("a**b");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(2);
  });

  it("unwraps when the selection already has the exact wrapper (idempotent)", () => {
    const result = wrapSelection("hello **world** rest", 6, 15, "**");
    expect(result.value).toBe("hello world rest");
    expect(result.selectionStart).toBe(6);
    expect(result.selectionEnd).toBe(11);
  });

  it("does not unwrap a partial wrapper match", () => {
    const result = wrapSelection("**world**", 0, 7, "**");
    expect(result.value).toBe("****world****");
  });
});

describe("insertLink", () => {
  it("wraps the selection as link text and pre-selects the url placeholder", () => {
    const result = insertLink("visit my site", 6, 13);
    expect(result.value).toBe("visit [my site](url)");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe(
      "url",
    );
  });

  it("inserts a template with the text placeholder selected when nothing is selected", () => {
    const result = insertLink("ab", 1, 1);
    expect(result.value).toBe("a[text](url)b");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe(
      "text",
    );
  });
});

describe("insertPrefix", () => {
  it("prefixes the current line", () => {
    const result = insertPrefix("first\nsecond line", 8, 13, "## ");
    expect(result.value).toBe("first\n## second line");
    expect(result.selectionStart).toBe(11);
    expect(result.selectionEnd).toBe(16);
  });

  it("removes the prefix when the line already has it (idempotent)", () => {
    const result = insertPrefix("## already headed", 5, 11, "## ");
    expect(result.value).toBe("already headed");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(8);
  });

  it("prefixes at the very start of the text", () => {
    const result = insertPrefix("top line", 0, 3, "- ");
    expect(result.value).toBe("- top line");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(5);
  });
});

describe("insertTextAtCursor", () => {
  it("inserts text at the caret and places the caret after it", () => {
    const result = insertTextAtCursor("hello world", 5, 5, " brave");
    expect(result.value).toBe("hello brave world");
    expect(result.selectionStart).toBe(11);
    expect(result.selectionEnd).toBe(11);
  });

  it("replaces the current selection", () => {
    const result = insertTextAtCursor("hello cruel world", 6, 11, "big");
    expect(result.value).toBe("hello big world");
    expect(result.selectionStart).toBe(9);
    expect(result.selectionEnd).toBe(9);
  });

  it("appends at the end when the caret sits after the last character", () => {
    const result = insertTextAtCursor("the end", 7, 7, " is near.");
    expect(result.value).toBe("the end is near.");
    expect(result.selectionStart).toBe(16);
    expect(result.selectionEnd).toBe(16);
  });

  it("handles an empty document", () => {
    const result = insertTextAtCursor("", 0, 0, "first line");
    expect(result.value).toBe("first line");
    expect(result.selectionStart).toBe(10);
    expect(result.selectionEnd).toBe(10);
  });
});
