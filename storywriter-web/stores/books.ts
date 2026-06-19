import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export interface Book {
  id: string;
  name: string;
  description: string;
  dateCreated: string;
}

export interface BookAccess {
  bookId: string;
  userId: string;
  permission: "read" | "write";
}

export interface BookAnalysisResult {
  generatedAt: string | null;
  bookId: string;
  bookName: string;
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  suggestions: string | null;
}

export const useBooksStore = defineStore("books", {
  state: () => ({
    books: [] as Book[],
    currentBook: null as Book | null,
  }),

  actions: {
    async fetchAll() {
      const res = await api.get("/books");
      this.books = res.data;
    },

    async fetchById(id: string) {
      const res = await api.get(`/books/${id}`);
      this.currentBook = res.data;
      return res.data;
    },

    async create(name: string, description?: string) {
      const res = await api.post("/books", { name, description });
      this.books.push(res.data);
      return res.data;
    },

    async update(id: string, data: Partial<Book>) {
      const res = await api.put(`/books/${id}`, data);
      const index = this.books.findIndex((b) => b.id === id);
      if (index >= 0) this.books[index] = res.data;
      if (this.currentBook?.id === id) this.currentBook = res.data;
      return res.data;
    },

    async remove(id: string) {
      await api.delete(`/books/${id}`);
      this.books = this.books.filter((b) => b.id !== id);
      if (this.currentBook?.id === id) this.currentBook = null;
    },

    async fetchAccess(bookId: string): Promise<BookAccess[]> {
      const res = await api.get(`/books/${bookId}/access`);
      return res.data;
    },

    async setAccess(
      bookId: string,
      userId: string,
      permission: "read" | "write",
    ) {
      await api.put(`/books/${bookId}/access`, { userId, permission });
    },

    async removeAccess(bookId: string, userId: string) {
      await api.delete(`/books/${bookId}/access/${userId}`);
    },

    async fetchAnalysis(bookId: string): Promise<BookAnalysisResult> {
      const res = await api.get(`/books/${bookId}/analysis`);
      return res.data;
    },

    async analyzeBook(bookId: string): Promise<BookAnalysisResult> {
      const res = await api.post(`/books/${bookId}/analysis`);
      return res.data;
    },

    async exportBook(bookId: string) {
      const res = await api.get(`/books/${bookId}/export`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      const filename = res.headers["x-filename"] || "book-export.tar.gz";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },

    async importBook(file: File): Promise<Book> {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/books/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      this.books.push(res.data);
      return res.data;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBooksStore, import.meta.hot));
}
