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

    getMediaUrl(bookId: string, mediaId: string): string {
      const base = `/api/books/${bookId}/media/${mediaId}/file`;
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("token");
        if (token) {
          return `${base}?token=${encodeURIComponent(token)}`;
        }
      }
      return base;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMediaStore, import.meta.hot));
}
