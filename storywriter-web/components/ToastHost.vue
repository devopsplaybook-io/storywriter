<template>
  <div class="toast-host" role="status" aria-live="polite">
    <div
      v-for="toast in toastsStore.toasts"
      :key="toast.id"
      class="toast"
      :class="toast.kind"
    >
      <i
        class="toast-icon"
        :class="
          toast.kind === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle'
        "
      />
      <span class="toast-message">{{ toast.message }}</span>
      <button
        class="toast-close"
        aria-label="Dismiss notification"
        @click="toastsStore.dismiss(toast.id)"
      >
        <i class="bi-x-lg" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { useToastsStore } from "../stores/toasts";

const toastsStore = useToastsStore();
</script>

<style scoped>
.toast-host {
  position: fixed;
  bottom: var(--space-lg);
  right: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  z-index: 1000;
  max-width: min(24rem, calc(100vw - 2 * var(--space-lg)));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--pico-muted-border-color, #444);
  background: var(--pico-card-background-color, #1d2832);
  color: var(--pico-color, inherit);
  box-shadow: var(--shadow-md);
  font-size: var(--text-sm);
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 0.1em;
}

.toast.success .toast-icon {
  color: var(--color-status-done, #198754);
}

.toast.error {
  border-color: var(--color-status-blocked, #dc3545);
}

.toast.error .toast-icon {
  color: var(--color-status-blocked, #dc3545);
}

.toast-message {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.toast-close {
  background: none;
  border: none;
  color: var(--pico-muted-color, #aaa);
  cursor: pointer;
  padding: 0;
  font-size: var(--text-xs);
  flex-shrink: 0;
}

.toast-close:hover {
  color: var(--pico-color, inherit);
}

@media (max-width: 768px) {
  .toast-host {
    bottom: var(--space-sm);
    right: var(--space-sm);
    left: var(--space-sm);
    max-width: none;
  }
}
</style>
