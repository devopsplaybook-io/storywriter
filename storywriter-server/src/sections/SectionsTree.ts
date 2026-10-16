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
