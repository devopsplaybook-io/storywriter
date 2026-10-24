import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export interface Media {
  id: string;
  bookId: string;
  slug: string;
  filename: string;
  mimeType: string;
  size: number;
  dateCreated: string;
}

interface ObjectUrlEntry {
  url: string;
  refs: number;
  promise: Promise<string> | null;
}

// Object URLs for private media: fetched as blobs (Authorization header) and
// kept in memory only, so nothing private ever lands in a URL, an HTTP cache
// or the service worker. Keyed `bookId/mediaId` with reference counting.
const objectUrlEntries = new Map<string, ObjectUrlEntry>();

function entryKey(bookId: string, mediaId: string): string {
  return `${bookId}/${mediaId}`;
}

export const useMediaStore = defineStore("media", {
  state: () => ({
    mediaByBook: {} as Record<string, Media[]>,
  }),

  getters: {
    getMediaForBook: (state) => (bookId: string) =>
      state.mediaByBook[bookId] || [],
    getMediaById: (state) => (id: string) => {
      for (const list of Object.values(state.mediaByBook)) {
        const found = list.find((m) => m.id === id);
        if (found) return found;
      }
      return null;
    },
    getMediaBySlug: (state) => (bookId: string, slug: string) => {
      const list = state.mediaByBook[bookId] || [];
      return list.find((m) => m.slug === slug) || null;
    },
  },

  actions: {
    async fetchMedia(bookId: string) {
      const res = await api.get(`/books/${bookId}/media`);
      this.mediaByBook[bookId] = res.data;
    },

    async uploadMedia(bookId: string, file: File): Promise<Media> {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(`/books/${bookId}/media`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!this.mediaByBook[bookId]) {
        this.mediaByBook[bookId] = [];
      }
      this.mediaByBook[bookId].push(res.data);
      return res.data;
    },

    async updateMediaSlug(bookId: string, mediaId: string, slug: string) {
      const res = await api.put(`/books/${bookId}/media/${mediaId}`, { slug });
      const list = this.mediaByBook[bookId];
      if (list) {
        const index = list.findIndex((m) => m.id === mediaId);
        if (index >= 0) list[index] = res.data;
      }
      return res.data;
    },

    async deleteMedia(bookId: string, mediaId: string) {
      await api.delete(`/books/${bookId}/media/${mediaId}`);
      const list = this.mediaByBook[bookId];
      if (list) {
        this.mediaByBook[bookId] = list.filter((m) => m.id !== mediaId);
      }
    },

    /**
     * Tokenless media file URL. The server only accepts the Authorization
     * header on this route, so use fetchMediaObjectUrl to display media.
     */
    getMediaUrl(bookId: string, mediaId: string): string {
      return `/api/books/${bookId}/media/${mediaId}/file`;
    },

    /**
     * Fetch a media file as a blob and return an in-memory object URL for it.
     * Concurrent callers share one fetch; release each claim with
     * releaseMediaObjectUrl.
     */
    async fetchMediaObjectUrl(
      bookId: string,
      mediaId: string,
    ): Promise<string> {
      const key = entryKey(bookId, mediaId);
      const existing = objectUrlEntries.get(key);
      if (existing) {
        existing.refs += 1;
        return existing.promise ?? existing.url;
      }
      const entry: ObjectUrlEntry = { url: "", refs: 1, promise: null };
      entry.promise = api
        .get(`/books/${bookId}/media/${mediaId}/file`, {
          responseType: "blob",
        })
        .then((res) => {
          entry.url = URL.createObjectURL(res.data);
          entry.promise = null;
          if (entry.refs <= 0) {
            // Every consumer went away while the fetch was in flight
            URL.revokeObjectURL(entry.url);
            objectUrlEntries.delete(key);
          }
          return entry.url;
        })
        .catch((err) => {
          if (objectUrlEntries.get(key) === entry) {
            objectUrlEntries.delete(key);
          }
          throw err;
        });
      objectUrlEntries.set(key, entry);
      return entry.promise;
    },

    /**
     * Drop one claim produced by fetchMediaObjectUrl; the object URL is
     * revoked when the last claim is released.
     */
    releaseMediaObjectUrl(bookId: string, mediaId: string): void {
      const key = entryKey(bookId, mediaId);
      const entry = objectUrlEntries.get(key);
      if (!entry) return;
      entry.refs -= 1;
      if (entry.refs <= 0 && entry.url) {
        URL.revokeObjectURL(entry.url);
        objectUrlEntries.delete(key);
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMediaStore, import.meta.hot));
}
