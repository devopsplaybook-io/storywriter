import { Section } from "../model/Section";
import {
  collectSubtree,
  isSelfOrDescendant,
  subtreeDepth,
} from "./SectionsTree";

function makeSection(id: string, parentId: string | null): Section {
  const section = new Section();
  section.id = id;
  section.parentId = parentId;
  return section;
}

describe("SectionsTree", () => {
  const sections = [
    makeSection("root", null),
    makeSection("child", "root"),
    makeSection("grandchild", "child"),
    makeSection("great", "grandchild"),
    makeSection("other", "root"),
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

  it("rejects ancestors and unrelated sections", () => {
    expect(isSelfOrDescendant("great", "root", sections)).toBe(false);
    expect(isSelfOrDescendant("child", "other", sections)).toBe(false);
  });

  it("handles missing ids", () => {
    expect(isSelfOrDescendant("child", "missing", sections)).toBe(false);
    expect(isSelfOrDescendant("missing", "child", sections)).toBe(false);
    expect(isSelfOrDescendant("missing", "missing", sections)).toBe(true);
  });
});

describe("collectSubtree", () => {
  const sections = [
    makeSection("root", null),
    makeSection("a", "root"),
    makeSection("b", "root"),
    makeSection("a1", "a"),
    makeSection("a2", "a"),
    makeSection("a1x", "a1"),
  ];

  it("returns the node and its descendants parent-first", () => {
    expect(collectSubtree("a", sections).map((s) => s.id)).toEqual([
      "a",
      "a1",
      "a1x",
      "a2",
    ]);
  });

  it("returns a single node for a leaf", () => {
    expect(collectSubtree("a1x", sections).map((s) => s.id)).toEqual(["a1x"]);
  });

  it("returns an empty list for an unknown id", () => {
    expect(collectSubtree("missing", sections)).toEqual([]);
  });

  it("is cycle-safe", () => {
    const cyclic = [
      makeSection("x", "y"),
      makeSection("y", "x"),
    ];
    const ids = collectSubtree("x", cyclic).map((s) => s.id);
    expect(ids).toEqual(["x", "y"]);
  });
});

describe("subtreeDepth", () => {
  const sections = [
    makeSection("root", null),
    makeSection("a", "root"),
    makeSection("a1", "a"),
    makeSection("a1x", "a1"),
    makeSection("b", "root"),
  ];

  it("counts the root node as depth 1", () => {
    expect(subtreeDepth("b", sections)).toBe(1);
    expect(subtreeDepth("a", sections)).toBe(3);
    expect(subtreeDepth("root", sections)).toBe(4);
  });

  it("returns 0 for an unknown id", () => {
    expect(subtreeDepth("missing", sections)).toBe(0);
  });
});
