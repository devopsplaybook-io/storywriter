import type { Section } from "../stores/sections";

export type DropMode = "before" | "after" | "into";

export function computeDropMode(
  ratioY: number,
  targetIsContainer: boolean,
): DropMode {
  if (targetIsContainer) {
    if (ratioY < 0.25) return "before";
    if (ratioY > 0.75) return "after";
    return "into";
  }
  return ratioY < 0.5 ? "before" : "after";
}

export function isSelfOrDescendant(
  sectionId: string,
  candidateId: string,
  sections: Section[],
): boolean {
  if (sectionId === candidateId) return true;
  const byId = new Map(sections.map((s) => [s.id, s]));
  let current = byId.get(candidateId) || null;
  while (current && current.parentId) {
    if (current.parentId === sectionId) return true;
    current = byId.get(current.parentId) || null;
  }
  return false;
}

export function validMoveTargets(
  sections: Section[],
  excludeId: string,
): Section[] {
  return sections.filter(
    (s) =>
      s.type === "container" &&
      !isSelfOrDescendant(excludeId, s.id, sections),
  );
}

export function buildReorderedSiblings(
  siblings: Section[],
  draggedId: string,
  targetId: string,
  mode: "before" | "after",
): Section[] | null {
  if (draggedId === targetId) return null;
  const fromIndex = siblings.findIndex((s) => s.id === draggedId);
  if (fromIndex < 0) return null;
  const targetIndex = siblings.findIndex((s) => s.id === targetId);
  if (targetIndex < 0) return null;
  const reordered = [...siblings];
  const [moved] = reordered.splice(fromIndex, 1);
  const insertIndex = reordered.findIndex((s) => s.id === targetId);
  reordered.splice(mode === "before" ? insertIndex : insertIndex + 1, 0, moved);
  return reordered;
}
