import { describe, expect, it } from "vitest";
import type { Section } from "../stores/sections";
import {
  buildReorderedSiblings,
  computeDropMode,
  isSelfOrDescendant,
  validMoveTargets,
} from "../utils/sectionTree";

function makeSection(overrides: Partial<Section>): Section {
  return {
    id: "s",
    bookId: "b",
    parentId: null,
    type: "text",
    title: "",
    content: "",
    analysis: "",
    mediaId: null,
    caption: "",
    orderIndex: 0,
    dateCreated: "",
    dateUpdated: "",
    ...overrides,
  } as Section;
}

describe("computeDropMode", () => {
  it("uses into/before/after zones on container targets", () => {
    expect(computeDropMode(0, true)).toBe("before");
    expect(computeDropMode(0.24, true)).toBe("before");
    expect(computeDropMode(0.25, true)).toBe("into");
    expect(computeDropMode(0.5, true)).toBe("into");
    expect(computeDropMode(0.75, true)).toBe("into");
    expect(computeDropMode(0.76, true)).toBe("after");
    expect(computeDropMode(1, true)).toBe("after");
  });

  it("falls back to before/after on non-container targets", () => {
    expect(computeDropMode(0, false)).toBe("before");
    expect(computeDropMode(0.49, false)).toBe("before");
    expect(computeDropMode(0.5, false)).toBe("after");
    expect(computeDropMode(1, false)).toBe("after");
  });
});

describe("isSelfOrDescendant", () => {
  const sections = [
    makeSection({ id: "root", parentId: null }),
    makeSection({ id: "child", parentId: "root" }),
    makeSection({ id: "grandchild", parentId: "child" }),
    makeSection({ id: "great", parentId: "grandchild" }),
    makeSection({ id: "other", parentId: "root" }),
  ];

  it("detects self", () => {
    expect(isSelfOrDescendant("child", "child", sections)).toBe(true);
  });

  it("detects a direct child", () => {
    expect(isSelfOrDescendant("child", "grandchild", sections)).toBe(true);
  });

  it("detects a deep descendant", () => {
    expect(isSelfOrDescendant("child", "great", sections)).toBe(true);
    expect(isSelfOrDescendant("root", "great", sections)).toBe(true);
  });

  it("rejects unrelated sections and ancestors", () => {
    expect(isSelfOrDescendant("great", "root", sections)).toBe(false);
    expect(isSelfOrDescendant("child", "other", sections)).toBe(false);
  });

  it("handles unknown ids", () => {
    expect(isSelfOrDescendant("child", "missing", sections)).toBe(false);
    expect(isSelfOrDescendant("missing", "child", sections)).toBe(false);
  });
});

describe("validMoveTargets", () => {
  const sections = [
    makeSection({ id: "root", parentId: null, type: "container" }),
    makeSection({ id: "part", parentId: "root", type: "container" }),
    makeSection({ id: "chapter", parentId: "part", type: "text" }),
    makeSection({ id: "media", parentId: "root", type: "media" }),
    makeSection({ id: "sub", parentId: "part", type: "container" }),
  ];

  it("excludes the section itself and its descendants", () => {
    const targets = validMoveTargets(sections, "part");
    const ids = targets.map((s) => s.id);
    expect(ids).not.toContain("part");
    expect(ids).not.toContain("sub");
    expect(ids).toContain("root");
  });

  it("excludes non-containers", () => {
    const targets = validMoveTargets(sections, "chapter");
    const ids = targets.map((s) => s.id);
    expect(ids).not.toContain("chapter");
    expect(ids).not.toContain("media");
    expect(ids).toEqual(["root", "part", "sub"]);
  });

  it("includes the root as a target", () => {
    expect(validMoveTargets(sections, "chapter").map((s) => s.id)).toContain(
      "root",
    );
  });
});

describe("buildReorderedSiblings", () => {
  const siblings = [
    makeSection({ id: "a", orderIndex: 0 }),
    makeSection({ id: "b", orderIndex: 1 }),
    makeSection({ id: "c", orderIndex: 2 }),
  ];

  it("moves a section before the target", () => {
    expect(
      buildReorderedSiblings(siblings, "c", "a", "before").map((s) => s.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("moves a section after the target", () => {
    expect(
      buildReorderedSiblings(siblings, "a", "c", "after").map((s) => s.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("keeps order when dropping onto an adjacent position", () => {
    expect(
      buildReorderedSiblings(siblings, "a", "b", "after").map((s) => s.id),
    ).toEqual(["b", "a", "c"]);
  });

  it("returns null for invalid drops", () => {
    expect(buildReorderedSiblings(siblings, "a", "a", "before")).toBeNull();
    expect(buildReorderedSiblings(siblings, "a", "a", "after")).toBeNull();
    expect(buildReorderedSiblings(siblings, "x", "a", "before")).toBeNull();
    expect(buildReorderedSiblings(siblings, "a", "x", "after")).toBeNull();
  });
});
