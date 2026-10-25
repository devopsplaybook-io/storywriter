import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";
import { countBookWords } from "../utils/wordCount";

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
  revision: number;
}

export const useSectionsStore = defineStore("sections", {
  state: () => ({
    sections: [] as Section[],
    currentSection: null as Section | null,
    // Live (unsaved) editor content per section id, so the book word total is
    // up to date between autosave ticks
    liveContent: {} as Record<string, string>,
  }),

  getters: {
    rootSection: (state) =>
      state.sections.find((s) => s.parentId === null) || null,
    getChildren: (state) => (parentId: string) =>
      state.sections
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    bookWordCount: (state) =>
      countBookWords(state.sections, state.liveContent),
  },

  actions: {
    setLiveContent(id: string, content: string) {
      this.liveContent[id] = content;
    },

    async fetchByBook(bookId: string) {
      const res = await api.get("/sections", { params: { bookId } });
      this.sections = res.data;
      this.liveContent = {};
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
      // Send the stored revision so the server can reject concurrent edits
      // with a 409; when the section is unknown locally the update is
      // unconditional (backwards compatible).
      const stored = this.sections.find((s) => s.id === id);
      const payload = stored
        ? { revision: stored.revision, ...data }
        : { ...data };
      const res = await api.put(`/sections/${id}`, payload);
      const index = this.sections.findIndex((s) => s.id === id);
      if (index >= 0) this.sections[index] = res.data;
      if (this.currentSection?.id === id) this.currentSection = res.data;
      return res.data;
    },

    async analyzeSection(id: string) {
      const res = await api.post(`/sections/${id}/analysis`);
      const index = this.sections.findIndex((s) => s.id === id);
      if (index >= 0) this.sections[index] = res.data;
      if (this.currentSection?.id === id) this.currentSection = res.data;
      return res.data;
    },

    async runAiAction(
      id: string,
      action: string,
      selection?: string,
    ): Promise<string> {
      const res = await api.post(`/sections/${id}/ai-action`, {
        action,
        selection,
      });
      return res.data.text;
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
      this.liveContent = Object.fromEntries(
        Object.entries(this.liveContent).filter(([key]) => key !== id),
      );
      if (this.currentSection?.id === id) this.currentSection = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSectionsStore, import.meta.hot));
}
