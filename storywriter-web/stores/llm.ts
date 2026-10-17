import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export const useLlmStore = defineStore("llm", {
  state: () => ({
    available: false,
    model: "",
    loaded: false,
  }),

  actions: {
    async fetchStatus() {
      try {
        const res = await api.get("/llm/status");
        this.available = Boolean(res.data.available);
        this.model = res.data.model || "";
      } catch {
        // Status fetch is best-effort; treat as unavailable rather than
        // promising AI actions that will fail.
        this.available = false;
        this.model = "";
      } finally {
        this.loaded = true;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLlmStore, import.meta.hot));
}
