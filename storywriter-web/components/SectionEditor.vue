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
          <select
            v-if="showTypeSelector"
            v-model="type"
            class="type-select"
            @change="saveType"
          >
            <option value="text">Text</option>
            <option value="container">Container</option>
            <option value="media">Media</option>
          </select>
          <button
            v-if="section.type === 'text'"
            class="btn-icon"
            :title="showAnalysis ? 'Hide analysis' : 'Show analysis'"
            @click="showAnalysis = !showAnalysis"
          >
            <i class="bi bi-robot" />
          </button>
          <button
            class="btn-icon"
            title="Version history"
            @click="$emit('versions')"
          >
            <i class="bi bi-clock-history" />
          </button>
          <button
            class="btn-icon"
            title="Save version"
            @click="$emit('save-version')"
          >
            <i class="bi bi-bookmark-plus" />
          </button>
        </div>
      </header>

      <!-- Section types assignment -->
      <div v-if="availableSectionTypes.length > 0" class="section-types-row">
        <span class="types-label">Types:</span>
        <div class="types-chips">
          <button
            v-for="typeName in availableSectionTypes"
            :key="typeName"
            class="type-badge"
            :class="{ active: assignedSectionTypes.includes(typeName) }"
            @click="toggleSectionType(typeName)"
          >
            {{ typeName }}
          </button>
        </div>
      </div>

      <!-- Text section: show analysis -->
      <div
        v-if="section.type === 'text' && showAnalysis"
        class="analysis-section"
      >
        <label class="analysis-label">
          <i class="bi bi-robot" /> Analysis (AI)
        </label>
        <textarea
          v-model="analysis"
          class="analysis-textarea"
          placeholder="AI analysis notes (hidden by default)"
          rows="3"
          @blur="saveAnalysis"
        />
      </div>

      <!-- Container section -->
      <div v-if="section.type === 'container'" class="container-info">
        <i class="bi bi-folder" />
        <p>This section contains child sections.</p>
        <p class="hint">Use the sidebar to add and manage child sections.</p>
      </div>

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
import { computed, ref, watch } from "vue";
import { useMediaStore } from "../stores/media";
import { usePropertiesStore } from "../stores/properties";

const props = defineProps({
  section: { type: Object, default: null },
  mediaList: { type: Array, default: () => [] },
});

const emit = defineEmits(["update", "versions", "save-version"]);

const mediaStore = useMediaStore();
const propertiesStore = usePropertiesStore();

const contentRef = ref(null);
const tab = ref("edit");
const showAnalysis = ref(false);

const type = ref("text");
const title = ref("");
const content = ref("");
const analysis = ref("");
const selectedMediaId = ref(null);
const caption = ref("");

const showTypeSelector = computed(() => {
  if (!props.section) return false;
  return true;
});

// Section types
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
  return marked(content.value, { breaks: true });
});

const renderedCaption = computed(() => {
  if (!caption.value) return "";
  return marked(caption.value, { breaks: true });
});

watch(
  () => props.section?.id,
  async () => {
    if (props.section) {
      type.value = props.section.type || "text";
      title.value = props.section.title || "";
      content.value = props.section.content || "";
      analysis.value = props.section.analysis || "";
      selectedMediaId.value = props.section.mediaId || null;
      caption.value = props.section.caption || "";
      // Fetch section values for section types
      await propertiesStore.fetchSectionValues(props.section.id);
    }
  },
  { immediate: true },
);

function saveType() {
  if (!props.section || type.value === (props.section.type || "text")) return;
  emit("update", { type: type.value });
}

function saveTitle() {
  if (!props.section || title.value === (props.section.title || "")) return;
  emit("update", { title: title.value });
}

function saveContent() {
  if (!props.section || content.value === (props.section.content || "")) return;
  emit("update", { content: content.value });
}

function saveAnalysis() {
  if (!props.section || analysis.value === (props.section.analysis || ""))
    return;
  emit("update", { analysis: analysis.value });
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
  height: 100%;
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

.type-badge {
  padding: var(--space-2xs) var(--space-xs);
  font-size: var(--text-sm);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  color: var(--pico-muted-color);
  transition: all var(--transition-fast);
}

.type-badge:hover {
  border-color: var(--pico-primary);
  color: var(--pico-primary);
}

.type-badge.active {
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

.type-select {
  font-size: var(--text-sm);
  padding: var(--space-2xs) var(--space-xs);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  cursor: pointer;
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

.analysis-section {
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-sm);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.analysis-label {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-xs);
}

.analysis-textarea {
  width: 100%;
  min-height: 3em;
  resize: vertical;
  font-size: var(--text-md);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-xs);
}

.container-info {
  display: grid;
  place-items: center;
  padding: var(--space-xl);
  text-align: center;
  color: var(--pico-muted-color);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  flex: 1;
}

.container-info i {
  font-size: var(--text-icon, 3rem);
  margin-bottom: var(--space-sm);
}

.container-info p {
  margin: var(--space-xs) 0;
}

.container-info .hint {
  font-size: var(--text-sm);
  opacity: 0.7;
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
  .editor-header {
    grid-template-columns: 1fr;
    gap: var(--space-xs);
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .title-input {
    font-size: var(--text-lg);
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
