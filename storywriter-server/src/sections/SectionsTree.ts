import { Section } from "../model/Section";

// Pure tree helper kept free of DB imports so it stays trivially unit-testable
export function isSelfOrDescendant(
  sectionId: string,
  candidateId: string,
  sections: Section[],
): boolean {
  if (sectionId === candidateId) {
    return true;
  }
  const byId = new Map<string, Section>(sections.map((s) => [s.id, s]));
  let current = byId.get(candidateId) || null;
  while (current && current.parentId) {
    if (current.parentId === sectionId) {
      return true;
    }
    current = byId.get(current.parentId) || null;
  }
  return false;
}

/**
 * Collect a section and all of its descendants in parent-first (pre-order)
 * order. Iterative and cycle-safe; unknown ids yield an empty list.
 */
export function collectSubtree(
  sectionId: string,
  sections: Section[],
): Section[] {
  const byId = new Map<string, Section>(sections.map((s) => [s.id, s]));
  const root = byId.get(sectionId);
  if (!root) {
    return [];
  }
  const children = new Map<string, Section[]>();
  for (const section of sections) {
    if (section.parentId) {
      const siblings = children.get(section.parentId) || [];
      siblings.push(section);
      children.set(section.parentId, siblings);
    }
  }
  const result: Section[] = [];
  const visited = new Set<string>();
  const stack: Section[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current.id)) {
      continue;
    }
    visited.add(current.id);
    result.push(current);
    const kids = children.get(current.id) || [];
    for (let i = kids.length - 1; i >= 0; i--) {
      stack.push(kids[i]);
    }
  }
  return result;
}

/**
 * Depth of the subtree rooted at `sectionId` (the root node counts as 1).
 * Returns 0 when the section is not part of `sections`.
 */
export function subtreeDepth(
  sectionId: string,
  sections: Section[],
): number {
  const subtree = collectSubtree(sectionId, sections);
  const depthById = new Map<string, number>();
  let maxDepth = 0;
  for (const section of subtree) {
    const depth =
      section.id === sectionId
        ? 1
        : (depthById.get(section.parentId) || 0) + 1;
    depthById.set(section.id, depth);
    maxDepth = Math.max(maxDepth, depth);
  }
  return maxDepth;
}
