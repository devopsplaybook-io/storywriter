<template>
  <div class="section-editor">
    <template v-if="section">
      <header class="editor-header">
        <input
          v-model="title"
          class="title-input"
          type="text"
          placeholder="Section title"
          @blur="saveTitle"
          @keydown.enter="$refs.contentRef?.focus()"
        />
        <div class="header-actions">
          <span
            v-if="saveStatus.status !== 'idle'"
            class="save-status"
            :class="saveStatus.status"
          >
            <i :class="statusIcon" />
            {{ statusLabel }}
          </span>
          <span class="type-badge">
            <i :class="typeIcon" />
            {{ section.type }}
          </span>
        </div>
      </header>

      <!-- Section types assignment -->
      <div v-if="availableSectionTypes.length > 0" class="section-types-row">
        <span class="types-label">Types:</span>
        <div class="types-chips">
          <button
            v-for="typeName in availableSectionTypes"
            :key="typeName"
            class="category-badge"
            :class="{ active: assignedSectionTypes.includes(typeName) }"
            @click="toggleSectionType(typeName)"
          >
            {{ typeName }}
          </button>
        </div>
      </div>

      <!-- Container section: show reorder view -->
      <SectionReorder
        v-if="section.type === 'container'"
        :children="children"
        :get-children="getChildren"
        @reorder="(payload) => $emit('reorder', payload)"
      />

      <!-- Media section -->
      <div v-if="section.type === 'media'" class="media-section">
        <div class="media-selector">
          <label>Select media:</label>
          <select v-model="selectedMediaId" @change="saveMediaId">
            <option value="">-- No media selected --</option>
            <option v-for="m in mediaList" :key="m.id" :value="m.id">
              {{ m.slug }}
            </option>
          </select>
        </div>
        <div v-if="selectedMediaId" class="media-preview">
          <img :src="mediaUrl" :alt="selectedMedia?.slug" />
        </div>
        <div v-if="selectedMediaId" class="caption-section">
          <label>Caption (markdown supported):</label>
          <textarea
            v-model="caption"
            class="caption-textarea"
            placeholder="Enter caption..."
            rows="3"
            @blur="saveCaption"
          />
          <div
            v-if="caption"
            class="caption-preview"
            v-html="renderedCaption"
          />
        </div>
      </div>

      <!-- Text section: show editor tabs -->
      <div v-if="section.type === 'text'" class="text-editor-section">
        <div class="editor-tabs">
          <button :class="{ active: tab === 'edit' }" @click="tab = 'edit'">
            <i class="bi bi-pencil" /> Edit
          </button>
          <button
            :class="{ active: tab === 'preview' }"
            @click="tab = 'preview'"
          >
            <i class="bi bi-eye" /> Preview
          </button>
        </div>

        <div v-if="tab === 'edit'" class="editor-content">
          <textarea
            ref="contentRef"
            v-model="content"
            class="content-textarea"
            placeholder="Write your content in markdown..."
            @blur="saveContent"
          />
        </div>
        <div v-else class="preview-content" v-html="renderedContent" />
      </div>
    </template>
    <div v-else class="empty-state">
      <i class="bi bi-file-text" />
      <p>Select a section to start editing.</p>
    </div>
  </div>
</template>

<script setup>
import { marked } from "marked";
import { watchDebounced } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMediaStore } from "../stores/media";
import { usePropertiesStore } from "../stores/properties";
import { useSaveStatusStore } from "../stores/saveStatus";
import {
  clearDraft,
  hasNewerDraft,
  readDraft,
  writeDraft,
} from "../utils/drafts";

const props = defineProps({
  section: { type: Object, default: null },
  mediaList: { type: Array, default: () => [] },
  children: { type: Array, default: () => [] },
  getChildren: { type: Function, default: () => () => [] },
});

const emit = defineEmits(["update", "reorder"]);

const mediaStore = useMediaStore();
const propertiesStore = usePropertiesStore();
const saveStatus = useSaveStatusStore();

const contentRef = ref(null);
const tab = ref("edit");

const content = ref("");
const selectedMediaId = ref(null);
const caption = ref("");

const title = ref("");
const typeIcon = computed(() => {
  switch (props.section?.type) {
    case "container":
      return "bi bi-folder";
    case "media":
      return "bi bi-image";
    default:
      return "bi bi-file-text";
  }
});

const availableSectionTypes = computed(() => {
  const prop = propertiesStore.sectionTypeProperty;
  return prop ? prop.options : [];
});

const assignedSectionTypes = computed(() => {
  if (!props.section) return [];
  return propertiesStore.getSectionTypes(props.section.id);
});

async function toggleSectionType(typeName) {
  if (!props.section) return;
  const prop = propertiesStore.sectionTypeProperty;
  if (!prop) return;
  await propertiesStore.toggleSectionType(props.section.id, prop.id, typeName);
}

const selectedMedia = computed(() => {
  if (!selectedMediaId.value) return null;
  return props.mediaList.find((m) => m.id === selectedMediaId.value) || null;
});

const mediaUrl = computed(() => {
  if (!selectedMedia.value || !props.section) return "";
  return mediaStore.getMediaUrl(props.section.bookId, selectedMedia.value.id);
});

const renderedContent = computed(() => {
  if (!content.value) return "<p class='empty-hint'>No content yet.</p>";
  return renderMarkdown(content.value, props.section?.bookId);
});

const renderedCaption = computed(() => {
  if (!caption.value) return "";
  return renderMarkdown(caption.value, props.section?.bookId);
});

function renderMarkdown(content, bookId) {
  if (!content) return "";
  const renderer = new marked.Renderer();
  renderer.image = ({ href, text }) => {
    if (!href) return "";
    if (/^(https?:\/\/|data:)/.test(href)) {
      return `<img src="${href}" alt="${text || ""}" />`;
    }
    if (!bookId) {
      return `<img src="${href}" alt="${text || ""}" />`;
    }
    const slug = href.replace(/\.[^/.]+$/, "");
    const media =
      mediaStore.getMediaBySlug(bookId, slug) ||
      mediaStore.getMediaBySlug(bookId, href);
    if (media) {
      const url = mediaStore.getMediaUrl(bookId, media.id);
      return `<img src="${url}" alt="${text || ""}" />`;
    }
    return `<img src="${href}" alt="${text || ""}" />`;
  };
  return marked(content, { breaks: true, renderer });
}

watch(
  () => props.section?.id,
  async () => {
    if (props.section) {
      title.value = props.section.title || "";
      content.value = props.section.content || "";
      selectedMediaId.value = props.section.mediaId || null;
      caption.value = props.section.caption || "";
      if (
        hasNewerDraft(
          "section",
          props.section.id,
          props.section.dateUpdated,
        )
      ) {
        const draft = readDraft("section", props.section.id);
        if (draft) {
          if (typeof draft.title === "string") title.value = draft.title;
          if (typeof draft.content === "string") content.value = draft.content;
          if (typeof draft.caption === "string") caption.value = draft.caption;
          if (draft.mediaId !== undefined)
            selectedMediaId.value = draft.mediaId;
        }
      } else {
        clearDraft("section", props.section.id);
      }
      // Fetch section values for section types
      await propertiesStore.fetchSectionValues(props.section.id);
    }
  },
  { immediate: true },
);

function diffFromServer() {
  if (!props.section) return {};
  const data = {};
  if (title.value !== (props.section.title || ""))
    data.title = title.value;
  if (content.value !== (props.section.content || ""))
    data.content = content.value;
  if (caption.value !== (props.section.caption || ""))
    data.caption = caption.value;
  if ((selectedMediaId.value || null) !== (props.section.mediaId || null))
    data.mediaId = selectedMediaId.value || null;
  return data;
}

function currentDraft() {
  return {
    title: title.value,
    content: content.value,
    caption: caption.value,
    mediaId: selectedMediaId.value || null,
    savedAt: new Date().toISOString(),
  };
}

// Mark the work unsaved as soon as the user edits (before the debounced save)
watch([title, content, caption, selectedMediaId], () => {
  if (!props.section) return;
  if (Object.keys(diffFromServer()).length > 0) {
    saveStatus.markUnsaved();
  }
});

// A save response replaces the section object; if the user kept typing in the
// meantime, restore the unsaved state that markSaved may have papered over
watch(
  () => props.section,
  () => {
    if (!props.section) return;
    if (
      saveStatus.status === "saved" &&
      Object.keys(diffFromServer()).length > 0
    ) {
      saveStatus.markUnsaved();
    }
  },
);

// Autosave ~2s after the last edit
watchDebounced(
  [title, content, caption, selectedMediaId],
  () => {
    if (!props.section) return;
    const data = diffFromServer();
    if (Object.keys(data).length > 0) {
      emit("update", data);
    } else if (saveStatus.status === "unsaved") {
      saveStatus.markIdle();
    }
  },
  { debounce: 2000 },
);

// Local draft buffer so in-flight text survives a crash, tab close or network loss
watchDebounced(
  [title, content, caption, selectedMediaId],
  () => {
    if (!props.section) return;
    if (Object.keys(diffFromServer()).length === 0) return;
    writeDraft("section", props.section.id, currentDraft());
  },
  { debounce: 800 },
);

function flushDraftOnUnload() {
  if (!props.section) return;
  if (saveStatus.isDirty) {
    writeDraft("section", props.section.id, currentDraft());
  }
}

onMounted(() => {
  window.addEventListener("beforeunload", flushDraftOnUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", flushDraftOnUnload);
});

const statusIcon = computed(() => {
  switch (saveStatus.status) {
    case "unsaved":
      return "bi bi-pencil";
    case "saving":
      return "bi bi-arrow-repeat";
    case "saved":
      return "bi bi-check-lg";
    case "error":
      return "bi bi-exclamation-triangle";
    default:
      return "";
  }
});

const statusLabel = computed(() => {
  switch (saveStatus.status) {
    case "unsaved":
      return "Unsaved";
    case "saving":
      return "Saving…";
    case "saved":
      return saveStatus.lastSavedAt
        ? `Saved ${new Date(saveStatus.lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Saved";
    case "error":
      return "Save failed";
    default:
      return "";
  }
});

function saveTitle() {
  if (!props.section || title.value === (props.section.title || "")) return;
  emit("update", { title: title.value });
}

function saveContent() {
  if (!props.section || content.value === (props.section.content || "")) return;
  emit("update", { content: content.value });
}

function saveMediaId() {
  if (
    !props.section ||
    selectedMediaId.value === (props.section.mediaId || null)
  )
    return;
  emit("update", { mediaId: selectedMediaId.value || null });
}

function saveCaption() {
  if (!props.section || caption.value === (props.section.caption || "")) return;
  emit("update", { caption: caption.value });
}
</script>

<style scoped>
.section-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex: 1;
  min-height: 0;
}

/* Section types row */
.section-types-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.types-label {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  white-space: nowrap;
}

.types-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.category-badge {
  padding: var(--space-2xs) var(--space-xs);
  font-size: var(--text-sm);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  color: var(--pico-muted-color);
  transition: all var(--transition-fast);
}

.category-badge:hover {
  border-color: var(--pico-primary);
  color: var(--pico-primary);
}

.category-badge.active {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
  border-color: var(--pico-primary);
  color: var(--pico-primary);
}

.editor-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-sm);
}

.title-input {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  border: none;
  background: transparent;
  padding: var(--space-xs);
  margin: 0;
}

.title-input:focus {
  outline: 2px solid var(--pico-primary);
  border-radius: var(--radius-sm, 4px);
}

.header-actions {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-muted-border-color, #333);
  color: var(--pico-muted-color, #aaa);
  text-transform: capitalize;
  white-space: nowrap;
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  color: var(--pico-muted-color, #aaa);
  white-space: nowrap;
}

.save-status.saved {
  color: var(--color-status-done, #198754);
  border-color: var(--color-status-done, #198754);
}

.save-status.error {
  color: var(--color-status-blocked, #dc3545);
  border-color: var(--color-status-blocked, #dc3545);
}

.save-status.saving i {
  display: inline-block;
  animation: save-spin 1s linear infinite;
}

@keyframes save-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.btn-icon {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  padding: var(--space-2xs) var(--space-xs);
  font-size: var(--text-lg);
  color: var(--pico-muted-color);
}

.btn-icon:hover {
  border-color: var(--pico-muted-border-color, #444);
  color: var(--pico-primary);
}

.media-section {
  display: grid;
  gap: var(--space-md);
  flex: 1;
  align-content: start;
}

.media-selector {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.media-selector label {
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.media-selector select {
  flex: 1;
  min-width: 0;
}

.media-preview {
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.media-preview img {
  max-width: 100%;
  max-height: 400px;
  display: block;
  margin: 0 auto;
}

.caption-section {
  display: grid;
  gap: var(--space-xs);
}

.caption-section label {
  font-weight: var(--weight-medium);
  font-size: var(--text-sm);
}

.caption-textarea {
  width: 100%;
  min-height: 3em;
  resize: vertical;
  font-size: var(--text-md);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-xs);
  font-family: var(--font-mono, monospace);
}

.caption-preview {
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.text-editor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-height: 0;
  flex: 1;
}

.editor-tabs {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.editor-tabs button {
  background: none;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-md);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.editor-tabs button.active {
  border-bottom-color: var(--pico-primary);
  color: var(--pico-primary);
}

.editor-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.content-textarea {
  width: 100%;
  flex: 1;
  min-height: 0;
  resize: vertical;
  font-family: var(--font-mono, monospace);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed, 1.6);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-sm);
}

.preview-content {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
}

.empty-state {
  display: grid;
  place-items: center;
  flex: 1;
  text-align: center;
  color: var(--pico-muted-color);
  gap: var(--space-sm);
}

.empty-state i {
  font-size: var(--text-icon, 3rem);
}

.empty-hint {
  opacity: 0.6;
}

/* Mobile: stack header, full-width textareas */
@media (max-width: 768px) {
  .section-editor {
    gap: var(--space-xs);
  }

  .editor-header {
    grid-template-columns: 1fr auto;
    gap: var(--space-2xs);
  }

  .header-actions {
    justify-content: flex-end;
    flex-wrap: nowrap;
  }

  .title-input {
    font-size: var(--text-lg);
    padding: var(--space-2xs);
  }

  .section-types-row {
    gap: var(--space-2xs);
  }

  .content-textarea {
    min-height: 100px;
  }

  .preview-content {
    min-height: 100px;
  }

  .media-preview img {
    max-height: 250px;
  }
}
</style>
