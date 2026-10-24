import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export interface BookAttribute {
  id: string;
  bookId: string;
  title: string;
  content: string;
  dateCreated: string;
  dateUpdated: string;
}

export const useBookAttributesStore = defineStore("bookAttributes", {
  state: () => ({
    attributes: [] as BookAttribute[],
    currentAttribute: null as BookAttribute | null,
  }),

  actions: {
    async fetchByBook(bookId: string) {
      const res = await api.get("/book-attributes", { params: { bookId } });
      this.attributes = res.data;
    },

    async create(bookId: string, title?: string, content?: string) {
      const res = await api.post("/book-attributes", {
        bookId,
        title,
        content,
      });
      this.attributes.push(res.data);
      return res.data;
    },

    async update(id: string, data: { title?: string; content?: string }) {
      const res = await api.put(`/book-attributes/${id}`, data);
      const index = this.attributes.findIndex((a) => a.id === id);
      if (index >= 0) this.attributes[index] = res.data;
      if (this.currentAttribute?.id === id) this.currentAttribute = res.data;
      return res.data;
    },

    async remove(id: string) {
      await api.delete(`/book-attributes/${id}`);
      this.attributes = this.attributes.filter((a) => a.id !== id);
      if (this.currentAttribute?.id === id) this.currentAttribute = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(useBookAttributesStore, import.meta.hot),
  );
}
