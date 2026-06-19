import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export type SectionType = "text" | "container" | "media";

export interface Section {
  id: string;
  bookId: string;
  parentId: string | null;
  type: SectionType;
  title: string;
  content: string;
  analysis: string;
  mediaId: string | null;
  caption: string;
  orderIndex: number;
  dateCreated: string;
  dateUpdated: string;
}

export const useSectionsStore = defineStore("sections", {
  state: () => ({
    sections: [] as Section[],
    currentSection: null as Section | null,
  }),

  getters: {
    rootSection: (state) =>
      state.sections.find((s) => s.parentId === null) || null,
    getChildren: (state) => (parentId: string) =>
      state.sections
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex),
  },

  actions: {
    async fetchByBook(bookId: string) {
      const res = await api.get("/sections", { params: { bookId } });
      this.sections = res.data;
    },

    async fetchById(id: string) {
      const res = await api.get(`/sections/${id}`);
      this.currentSection = res.data;
      return res.data;
    },

    async create(
      bookId: string,
      parentId: string,
      type?: SectionType,
      title?: string,
      orderIndex?: number,
    ) {
      const res = await api.post("/sections", {
        bookId,
        parentId,
        type,
        title,
        orderIndex,
      });
      this.sections.push(res.data);
      return res.data;
    },

    async update(
      id: string,
      data: {
        type?: SectionType;
        title?: string;
        content?: string;
        analysis?: string;
        mediaId?: string;
        caption?: string;
      },
    ) {
      const res = await api.put(`/sections/${id}`, data);
      const index = this.sections.findIndex((s) => s.id === id);
      if (index >= 0) this.sections[index] = res.data;
      if (this.currentSection?.id === id) this.currentSection = res.data;
      return res.data;
    },

    async reorder(id: string, orderIndex: number) {
      await api.put(`/sections/${id}/order`, { orderIndex });
      const index = this.sections.findIndex((s) => s.id === id);
      if (index >= 0) this.sections[index].orderIndex = orderIndex;
    },

    async move(id: string, parentId: string, orderIndex: number) {
      await api.put(`/sections/${id}/move`, { parentId, orderIndex });
      const index = this.sections.findIndex((s) => s.id === id);
      if (index >= 0) {
        this.sections[index].parentId = parentId;
        this.sections[index].orderIndex = orderIndex;
      }
    },

    async copy(id: string, targetParentId: string, orderIndex: number) {
      const res = await api.post(`/sections/${id}/copy`, {
        targetParentId,
        orderIndex,
      });
      await this.fetchByBook(res.data.bookId);
      return res.data;
    },

    async remove(id: string) {
      await api.delete(`/sections/${id}`);
      this.sections = this.sections.filter((s) => s.id !== id);
      if (this.currentSection?.id === id) this.currentSection = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSectionsStore, import.meta.hot));
}
