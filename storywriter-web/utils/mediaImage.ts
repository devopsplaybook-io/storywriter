import type { Directive } from "vue";
import { MEDIA_FILE_URL_PATTERN } from "./safeMarkdown";

/**
 * Media images are served behind the Authorization header only, so they are
 * fetched as blobs (with credentials from the shared axios instance) and
 * displayed via short-lived object URLs. This module swaps tokenless media
 * file URLs inside rendered markdown for object URLs, so `<img>` works
 * without ever putting a token in a URL.
 */

export interface MediaImageDeps {
  fetchObjectUrl: (bookId: string, mediaId: string) => Promise<string>;
  releaseObjectUrl: (bookId: string, mediaId: string) => void;
}

export function isMediaFileUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  let path = url;
  if (
    typeof window !== "undefined" &&
    url.startsWith(window.location.origin + "/")
  ) {
    path = url.slice(window.location.origin.length);
  }
  return MEDIA_FILE_URL_PATTERN.test(path);
}

interface ElementState {
  keys: Set<string>;
  running: boolean;
  rerun: boolean;
  released: boolean;
}

const elementStates = new WeakMap<HTMLElement, ElementState>();

function getState(el: HTMLElement): ElementState {
  let state = elementStates.get(el);
  if (!state) {
    state = { keys: new Set(), running: false, rerun: false, released: false };
    elementStates.set(el, state);
  }
  return state;
}

/**
 * Replace every media-file img src under `root` with an object URL fetched
 * through `deps.fetchObjectUrl`. Keys this element no longer uses are
 * released through `deps.releaseObjectUrl`.
 */
export async function hydrateMediaImages(
  root: HTMLElement,
  deps: MediaImageDeps,
): Promise<void> {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const state = getState(root);
  const wanted = new Set<string>();
  const jobs: Promise<void>[] = [];
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (!src || !isMediaFileUrl(src)) continue;
    const match = src.match(MEDIA_FILE_URL_PATTERN);
    if (!match) continue;
    const [, bookId, mediaId] = match;
    const key = `${bookId}/${mediaId}`;
    wanted.add(key);
    if (img.dataset.mediaLoaded === "true") continue;
    // Claim synchronously so concurrent passes never fetch twice for one img
    img.dataset.mediaLoaded = "true";
    jobs.push(
      deps
        .fetchObjectUrl(bookId, mediaId)
        .then((url) => {
          img.src = url;
        })
        .catch(() => {
          // Leave the tokenless URL in place; retry on the next pass
          delete img.dataset.mediaLoaded;
        }),
    );
  }
  await Promise.allSettled(jobs);
  if (state.released) return;
  for (const key of Array.from(state.keys)) {
    if (!wanted.has(key)) {
      state.keys.delete(key);
      releaseKey(deps, key);
    }
  }
  for (const key of wanted) state.keys.add(key);
}

function releaseKey(deps: MediaImageDeps, key: string): void {
  const [bookId, mediaId] = key.split("/");
  deps.releaseObjectUrl(bookId, mediaId);
}

function scheduleHydration(el: HTMLElement, deps: MediaImageDeps): void {
  const state = getState(el);
  if (state.released) return;
  if (state.running) {
    state.rerun = true;
    return;
  }
  state.running = true;
  Promise.resolve().then(async () => {
    try {
      do {
        state.rerun = false;
        await hydrateMediaImages(el, deps);
      } while (state.rerun);
    } finally {
      state.running = false;
    }
  });
}

/**
 * Vue directive to use next to every v-html that may contain markdown images:
 * `v-media-images` on the same element as the v-html binding.
 */
export function createMediaImagesDirective(
  deps: MediaImageDeps,
): Directive<HTMLElement> {
  return {
    mounted(el) {
      scheduleHydration(el, deps);
    },
    updated(el) {
      scheduleHydration(el, deps);
    },
    unmounted(el) {
      const state = getState(el);
      state.released = true;
      for (const key of Array.from(state.keys)) {
        state.keys.delete(key);
        releaseKey(deps, key);
      }
    },
  };
}
