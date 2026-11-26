import { useSaveStatusStore } from "../stores/saveStatus";

type DraftFlusher = () => void;

const flushers = new Set<DraftFlusher>();

export function registerDraftFlusher(flusher: DraftFlusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

/**
 * Persist every open editor's in-memory text to the local draft buffer.
 * Throws when offline with unsaved changes so a reload cannot lose work that
 * has no local copy yet.
 */
export function flushPendingDrafts(): void {
  const saveStatus = useSaveStatusStore();
  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false &&
    saveStatus.isDirty
  ) {
    throw new Error("Offline with unsaved changes: reload postponed");
  }
  for (const flush of [...flushers]) flush();
}
