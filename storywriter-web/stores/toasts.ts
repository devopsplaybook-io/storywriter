import { acceptHMRUpdate, defineStore } from "pinia";

export type ToastKind = "error" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const MAX_TOASTS = 4;
const SUCCESS_TIMEOUT_MS = 5000;
const ERROR_TIMEOUT_MS = 10000;

export const useToastsStore = defineStore("toasts", {
  state: () => ({
    toasts: [] as Toast[],
    nextId: 1,
  }),

  actions: {
    push(kind: ToastKind, message: string) {
      const id = this.nextId++;
      this.toasts.push({ id, kind, message });
      if (this.toasts.length > MAX_TOASTS) {
        this.toasts.splice(0, this.toasts.length - MAX_TOASTS);
      }
      const timeout =
        kind === "success" ? SUCCESS_TIMEOUT_MS : ERROR_TIMEOUT_MS;
      setTimeout(() => this.dismiss(id), timeout);
      return id;
    },

    error(message: string) {
      return this.push("error", message);
    },

    success(message: string) {
      return this.push("success", message);
    },

    dismiss(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastsStore, import.meta.hot));
}
