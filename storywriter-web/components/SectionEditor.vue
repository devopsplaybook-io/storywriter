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
          <span class="word-count" title="Word count (markdown stripped)">
            <i class="bi bi-123" />
            {{ sectionWordCount }} words
          </span>
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
          <button
            v-if="focusMode"
            class="btn-icon"
            :class="{ active: typewriter }"
            title="Typewriter scrolling"
            @click="toggleTypewriter"
          >
            <i class="bi bi-align-center" />
          </button>
          <button
            class="btn-icon"
            :class="{ active: focusMode }"
            title="Focus mode (Ctrl/Cmd+Shift+F)"
            @click="$emit('toggle-focus')"
          >
            <i class="bi bi-arrows-angle-expand" />
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
        <div class="editor-toolbar-row">
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
          <div class="format-toolbar">
            <button title="Bold (Ctrl/Cmd+B)" @click.prevent="applyFormat('bold')"><i class="bi bi-type-bold" /></button>
            <button title="Italic (Ctrl/Cmd+I)" @click.prevent="applyFormat('italic')"><i class="bi bi-type-italic" /></button>
            <button title="Heading (H2)" @click.prevent="applyFormat('h2')"><i class="bi bi-type-h2" /></button>
            <button title="Bullet list" @click.prevent="applyFormat('bullet')"><i class="bi bi-list-ul" /></button>
            <button title="Numbered list" @click.prevent="applyFormat('numbered')"><i class="bi bi-list-ol" /></button>
            <button title="Quote" @click.prevent="applyFormat('quote')"><i class="bi bi-quote" /></button>
            <button title="Inline code" @click.prevent="applyFormat('code')"><i class="bi bi-code-slash" /></button>
            <button title="Link (Ctrl/Cmd+K)" @click.prevent="applyFormat('link')"><i class="bi bi-link-45deg" /></button>
            <button title="Image" @click.prevent="applyFormat('image')"><i class="bi bi-card-image" /></button>
            <button
              title="Find & Replace (Ctrl/Cmd+F)"
              :class="{ active: findOpen }"
              @click.prevent="toggleFind"
            >
              <i class="bi bi-search" />
            </button>
          </div>
        </div>

        <div
          v-if="findOpen"
          class="find-replace-bar"
          @keydown.esc.prevent="closeFind"
        >
          <div class="find-row">
            <input
              ref="findInput"
              v-model="findQuery"
              type="text"
              class="find-input"
              placeholder="Find"
              @keydown.enter.prevent="nextMatch"
              @keydown.esc.prevent="closeFind"
            />
            <span class="match-count">
              {{ matchIndices.length ? currentMatchIndex + 1 : 0 }} of
              {{ matchIndices.length }}
            </span>
            <button class="tool-btn" title="Previous match (Shift+Enter)" @click.prevent="prevMatch">
              <i class="bi bi-chevron-up" />
            </button>
            <button class="tool-btn" title="Next match (Enter)" @click.prevent="nextMatch">
              <i class="bi bi-chevron-down" />
            </button>
          </div>
          <div class="find-row">
            <input
              v-model="replaceQuery"
              type="text"
              class="find-input"
              placeholder="Replace with"
              @keydown.esc.prevent="closeFind"
            />
            <button class="tool-btn" title="Replace current match" @click.prevent="replaceCurrent">Replace</button>
            <button class="tool-btn" title="Replace all matches" @click.prevent="replaceAll">All</button>
            <button class="tool-btn" title="Close find & replace (Esc)" @click.prevent="closeFind">
              <i class="bi bi-x-lg" />
            </button>
          </div>
        </div>

        <div v-if="tab === 'edit'" class="editor-content">
          <textarea
            ref="contentRef"
            v-model="content"
            class="content-textarea"
            placeholder="Write your content in markdown..."
            @blur="saveContent"
            @keydown="onTextareaKeydown"
            @input="onCaretMoved"
            @keyup="onCaretMoved"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMediaStore } from "../stores/media";
import { usePropertiesStore } from "../stores/properties";
import { useSaveStatusStore } from "../stores/saveStatus";
import { useSectionsStore } from "../stores/sections";
import {
  clearDraft,
  hasNewerDraft,
  readDraft,
  writeDraft,
} from "../utils/drafts";
import { countWords } from "../utils/wordCount";
import { insertLink, insertPrefix, wrapSelection } from "../utils/markdownEdit";

const props = defineProps({
  section: { type: Object, default: null },
  mediaList: { type: Array, default: () => [] },
  children: { type: Array, default: () => [] },
  getChildren: { type: Function, default: () => () => [] },
  focusMode: { type: Boolean, default: false },
});

const emit = defineEmits(["update", "reorder", "toggle-focus"]);

const mediaStore = useMediaStore();
const propertiesStore = usePropertiesStore();
const saveStatus = useSaveStatusStore();
const sectionsStore = useSectionsStore();

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

const sectionWordCount = computed(() => countWords(content.value));

// Keep the store's live content in sync so the book total updates per keystroke
watch(content, (value) => {
  if (props.section) {
    sectionsStore.setLiveContent(props.section.id, value);
  }
});

// ==================== Typewriter scrolling (focus mode) ====================

const typewriter = ref(
  typeof window !== "undefined"
    ? localStorage.getItem("storywriter.typewriter") === "true"
    : false,
);

function toggleTypewriter() {
  typewriter.value = !typewriter.value;
  try {
    localStorage.setItem("storywriter.typewriter", String(typewriter.value));
  } catch {
    // Best-effort preference persistence
  }
}

// Approximation: counts hard newlines before the caret (soft wraps not
// accounted for), then centers that line vertically in the textarea.
function scrollCaretToCenter() {
  if (!typewriter.value) return;
  const el = contentRef.value;
  if (!el) return;
  const style = window.getComputedStyle(el);
  const lineHeight =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 24;
  const lineIndex = content.value.slice(0, el.selectionStart).split("\n")
    .length - 1;
  el.scrollTop = Math.max(0, lineIndex * lineHeight - el.clientHeight / 2);
}

function onCaretMoved() {
  if (tab.value !== "edit" || !typewriter.value) return;
  nextTick(scrollCaretToCenter);
}

// ==================== Markdown formatting ====================

function applySelection(edit) {
  const el = contentRef.value;
  if (!el) return;
  const result = edit(content.value, el.selectionStart, el.selectionEnd);
  content.value = result.value;
  nextTick(() => {
    el.focus();
    el.setSelectionRange(result.selectionStart, result.selectionEnd);
    onCaretMoved();
  });
}

function applyFormat(kind) {
  switch (kind) {
    case "bold":
      applySelection((v, s, e) => wrapSelection(v, s, e, "**"));
      break;
    case "italic":
      applySelection((v, s, e) => wrapSelection(v, s, e, "*"));
      break;
    case "code":
      applySelection((v, s, e) => wrapSelection(v, s, e, "`"));
      break;
    case "link":
      applySelection((v, s, e) => insertLink(v, s, e));
      break;
    case "image":
      applySelection((v, s, e) => wrapSelection(v, s, e, "![", "](slug)"));
      break;
    case "h2":
      applySelection((v, s, e) => insertPrefix(v, s, e, "## "));
      break;
    case "bullet":
      applySelection((v, s, e) => insertPrefix(v, s, e, "- "));
      break;
    case "numbered":
      applySelection((v, s, e) => insertPrefix(v, s, e, "1. "));
      break;
    case "quote":
      applySelection((v, s, e) => insertPrefix(v, s, e, "> "));
      break;
  }
}

function onTextareaKeydown(event) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyFormat("bold");
      return;
    }
    if (key === "i") {
      event.preventDefault();
      applyFormat("italic");
      return;
    }
    if (key === "k") {
      event.preventDefault();
      applyFormat("link");
      return;
    }
    if (key === "f" && !event.shiftKey) {
      event.preventDefault();
      openFind();
      return;
    }
  }
  if (event.key === "Escape" && findOpen.value) {
    event.preventDefault();
    closeFind();
  }
}

// ==================== Find & replace ====================

const findOpen = ref(false);
const findInput = ref(null);
const findQuery = ref("");
const replaceQuery = ref("");
const currentMatchIndex = ref(0);

const matchIndices = computed(() => {
  const needle = findQuery.value.toLowerCase();
  if (!needle) return [];
  const haystack = content.value.toLowerCase();
  const indices = [];
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    indices.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return indices;
});

function openFind() {
  findOpen.value = true;
  const el = contentRef.value;
  if (el && !findQuery.value) {
    const selected = content.value.slice(el.selectionStart, el.selectionEnd);
    if (selected && !selected.includes("\n")) {
      findQuery.value = selected;
    }
  }
  nextTick(() => findInput.value?.focus());
}

function closeFind() {
  findOpen.value = false;
  currentMatchIndex.value = 0;
  nextTick(() => contentRef.value?.focus());
}

function toggleFind() {
  if (findOpen.value) {
    closeFind();
  } else {
    openFind();
  }
}

function focusMatchAt(index) {
  const el = contentRef.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(index, index + findQuery.value.length);
}

function nextMatch() {
  if (!matchIndices.value.length) return;
  currentMatchIndex.value =
    (currentMatchIndex.value + 1) % matchIndices.value.length;
  focusMatchAt(matchIndices.value[currentMatchIndex.value]);
}

function prevMatch() {
  if (!matchIndices.value.length) return;
  currentMatchIndex.value =
    (currentMatchIndex.value - 1 + matchIndices.value.length) %
    matchIndices.value.length;
  focusMatchAt(matchIndices.value[currentMatchIndex.value]);
}

function replaceCurrent() {
  if (!matchIndices.value.length) return;
  const at = matchIndices.value[currentMatchIndex.value];
  const next =
    content.value.slice(0, at) +
    replaceQuery.value +
    content.value.slice(at + findQuery.value.length);
  content.value = next;
  nextTick(() => {
    if (matchIndices.value.length) {
      currentMatchIndex.value = currentMatchIndex.value % matchIndices.value.length;
      focusMatchAt(matchIndices.value[currentMatchIndex.value]);
    }
  });
}

function replaceAll() {
  const needle = findQuery.value;
  if (!needle) return;
  content.value = content.value.split(needle).join(replaceQuery.value);
}

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

.word-count {
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
  font-variant-numeric: tabular-nums;
}

.editor-toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.format-toolbar {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
}

.format-toolbar button {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  padding: var(--space-3xs, 2px) var(--space-2xs);
  font-size: var(--text-md);
  color: var(--pico-muted-color);
  line-height: 1;
}

.format-toolbar button:hover {
  border-color: var(--pico-muted-border-color, #444);
  color: var(--pico-primary);
}

.format-toolbar button.active {
  color: var(--pico-primary);
  border-color: var(--pico-primary);
}

.find-replace-bar {
  display: grid;
  gap: var(--space-2xs);
  padding: var(--space-2xs) var(--space-xs);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.find-row {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.find-input {
  flex: 1;
  min-width: 0;
  padding: var(--space-3xs, 2px) var(--space-2xs);
  margin: 0;
  height: auto;
  font-size: var(--text-sm);
  font-family: var(--font-mono, monospace);
}

.match-count {
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.tool-btn {
  background: none;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  padding: var(--space-3xs, 2px) var(--space-2xs);
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
  white-space: nowrap;
}

.tool-btn:hover {
  border-color: var(--pico-primary);
  color: var(--pico-primary);
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
