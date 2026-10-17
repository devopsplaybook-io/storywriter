<template>
  <dialog :open="open">
    <article>
      <header>
        <h3>Export Book - {{ book?.name }}</h3>
        <button class="close-btn" aria-label="Close" @click="$emit('close')">
          <i class="bi bi-x-lg" />
        </button>
      </header>
      <section>
        <fieldset>
          <legend>Format</legend>
          <div class="format-grid">
            <label
              v-for="option in formatOptions"
              :key="option.value"
              class="format-option"
              :class="{ selected: format === option.value }"
            >
              <input
                v-model="format"
                type="radio"
                name="export-format"
                :value="option.value"
              />
              <span class="format-label">
                <i :class="option.icon" /> {{ option.label }}
                <small>{{ option.hint }}</small>
              </span>
            </label>
          </div>
        </fieldset>
        <label class="include-option">
          <input
            v-model="includeFull"
            type="checkbox"
            :disabled="format === 'targz'"
          />
          Include AI notes and properties
        </label>
        <small v-if="format === 'targz'" class="format-hint">
          The backup archive contains the whole book (sections, media,
          properties) and can be re-imported.
        </small>
      </section>
      <footer class="dialog-footer">
        <button class="secondary" @click="$emit('close')">Cancel</button>
        <button :aria-busy="exporting" :disabled="exporting" @click="confirmExport">
          <i class="bi bi-download" /> Export
        </button>
      </footer>
    </article>
  </dialog>
</template>

<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  book: { type: Object, default: null },
  exporting: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "export"]);

const formatOptions = [
  {
    value: "markdown",
    label: "Markdown",
    hint: "Single .md file, self-contained",
    icon: "bi bi-filetype-md",
  },
  {
    value: "docx",
    label: "Word",
    hint: ".docx for editors and beta readers",
    icon: "bi bi-file-earmark-word",
  },
  {
    value: "epub",
    label: "EPUB",
    hint: ".epub for e-readers",
    icon: "bi bi-file-earmark-text",
  },
  {
    value: "targz",
    label: "Backup",
    hint: "Full archive for re-import",
    icon: "bi bi-file-zip",
  },
];

const format = ref("markdown");
const includeFull = ref(false);

watch(
  () => props.open,
  (val) => {
    if (val) {
      format.value = "markdown";
      includeFull.value = false;
    }
  },
);

watch(format, (val) => {
  if (val === "targz") {
    includeFull.value = false;
  }
});

function confirmExport() {
  emit("export", {
    format: format.value,
    include: includeFull.value ? "full" : "content",
  });
}
</script>

<style scoped>
.format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.format-grid legend {
  font-weight: 600;
  margin-bottom: var(--space-2xs);
  padding: 0;
}

.format-option {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2xs);
  align-items: start;
  width: 100%;
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--pico-border-radius, 8px);
  cursor: pointer;
  margin: 0;
  transition: border-color var(--transition-fast);
}

.format-option:hover,
.format-option.selected {
  border-color: var(--pico-primary);
}

.format-option input {
  margin: 0.2em 0 0;
  width: auto;
}

.format-label {
  display: grid;
  gap: 0.1rem;
  font-size: var(--text-md);
}

.format-label small {
  opacity: 0.7;
}

.format-label i {
  margin-right: 0.35em;
}

.include-option {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-2xs);
}

.include-option input {
  width: auto;
  margin: 0;
}

.format-hint {
  opacity: 0.7;
  display: block;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

/* Mobile: single column format list */
@media (max-width: 768px) {
  .format-grid {
    grid-template-columns: 1fr;
  }
}
</style>
