import { Section } from "../model/Section";
import { isSelfOrDescendant } from "./SectionsTree";

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
