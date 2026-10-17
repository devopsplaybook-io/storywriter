export type DraftKind = "section" | "attribute";

export interface DraftData {
  title?: string;
  content?: string;
  analysis?: string;
  caption?: string;
  mediaId?: string | null;
  savedAt: string;
}

const KEY_PREFIX = "storywriter.draft.";

function storageKey(kind: DraftKind, id: string) {
  return `${KEY_PREFIX}${kind}.${id}`;
}

export function writeDraft(kind: DraftKind, id: string, data: DraftData) {
  try {
    localStorage.setItem(storageKey(kind, id), JSON.stringify(data));
  } catch {
    // Quota or serialization errors: drafts are best-effort, never throw.
  }
}

export function readDraft(kind: DraftKind, id: string): DraftData | null {
  try {
    const raw = localStorage.getItem(storageKey(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "string") {
      return null;
    }
    return parsed as DraftData;
  } catch {
    return null;
  }
}

export function clearDraft(kind: DraftKind, id: string) {
  try {
    localStorage.removeItem(storageKey(kind, id));
  } catch {
    // Best-effort removal, never throw.
  }
}

export function hasNewerDraft(
  kind: DraftKind,
  id: string,
  serverDateUpdated: string | null | undefined,
): boolean {
  const draft = readDraft(kind, id);
  if (!draft) return false;
  const draftTime = Date.parse(draft.savedAt);
  if (Number.isNaN(draftTime)) return false;
  const serverTime = serverDateUpdated
    ? Date.parse(serverDateUpdated)
    : Number.NaN;
  if (Number.isNaN(serverTime)) return true;
  return draftTime > serverTime;
}
