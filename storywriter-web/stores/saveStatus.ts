import { acceptHMRUpdate, defineStore } from "pinia";

export type SaveStatusValue = "idle" | "unsaved" | "saving" | "saved" | "error";

export const useSaveStatusStore = defineStore("saveStatus", {
  state: () => ({
    status: "idle" as SaveStatusValue,
    lastSavedAt: null as string | null,
    errorMessage: null as string | null,
  }),

  getters: {
    isDirty: (state) =>
      state.status === "unsaved" ||
      state.status === "saving" ||
      state.status === "error",
  },

  actions: {
    markUnsaved() {
      this.status = "unsaved";
      this.errorMessage = null;
    },

    markSaving() {
      this.status = "saving";
      this.errorMessage = null;
    },

    markSaved() {
      this.status = "saved";
      this.lastSavedAt = new Date().toISOString();
      this.errorMessage = null;
    },

    markError(message: string) {
      this.status = "error";
      this.errorMessage = message;
    },

    markIdle() {
      this.status = "idle";
      this.errorMessage = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSaveStatusStore, import.meta.hot));
}
