<template>
  <div class="section-recursive-view">
    <div v-if="flatSections.length === 0" class="empty-recursive">
      <i class="bi bi-folder" />
      <p>This container has no child sections with content.</p>
    </div>

    <div v-else class="recursive-scroll">
      <div
        v-for="item in flatSections"
        :key="item.id"
        ref="sectionBlocks"
        class="section-block"
        :class="[
          'depth-' + Math.min(item.depth, 4),
          { editing: mode === 'edit' },
        ]"
        :data-section-id="item.id"
      >
        <div v-if="visibleSections.has(item.id)" class="section-block-content">
          <!-- ===== VIEW MODE ===== -->
          <template v-if="mode !== 'edit'">
            <h3
              class="section-block-title"
              :class="'title-depth-' + Math.min(item.depth, 4)"
            >
              <i :class="getIcon(item)" />
              {{ item.title || "Untitled" }}
            </h3>
            <div
              v-if="item.type === 'text' && item.content"
              class="section-block-text"
              v-html="renderMarkdown(item.content, item.bookId)"
            />
            <div v-else-if="item.type === 'media'" class="section-block-media">
              <img
                v-if="getMediaUrl(item)"
                :src="getMediaUrl(item)"
                :alt="item.title"
              />
              <p v-if="item.caption" class="media-caption">
                {{ item.caption }}
              </p>
            </div>
            <div
              v-else-if="item.type === 'container'"
              class="section-block-container-hint"
            >
              <span>Container — {{ getChildCount(item.id) }} sub-sections</span>
            </div>
            <div v-else-if="item.type === 'text'" class="section-block-empty">
              <em>No content</em>
            </div>
          </template>

          <!-- ===== EDIT MODE ===== -->
          <template v-else>
            <div class="edit-header">
              <i :class="getIcon(item)" class="edit-icon" />
              <input
                :value="item.title"
                class="edit-title-input"
                :class="'title-depth-' + Math.min(item.depth, 4)"
                type="text"
                placeholder="Section title"
                @blur="onTitleBlur(item, $event)"
              />
            </div>

            <!-- Text section: inline editor -->
            <template v-if="item.type === 'text'">
              <div class="edit-tabs">
                <button
                  :class="{ active: editTabs[item.id] !== 'preview' }"
                  @click="editTabs[item.id] = 'edit'"
                >
                  <i class="bi bi-pencil" /> Edit
                </button>
                <button
                  :class="{ active: editTabs[item.id] === 'preview' }"
                  @click="editTabs[item.id] = 'preview'"
                >
                  <i class="bi bi-eye" /> Preview
                </button>
              </div>
              <textarea
                v-if="editTabs[item.id] !== 'preview'"
                :ref="
                  (el) => {
                    if (el) autoResize(el);
                  }
                "
                :value="item.content"
                class="edit-content-textarea"
                placeholder="Write content in markdown..."
                @input="onContentInput(item, $event)"
                @blur="onContentBlur(item, $event)"
              />
              <div
                v-else
                class="section-block-text"
                v-html="renderMarkdown(item.content, item.bookId)"
              />
            </template>

            <!-- Media section: read-only in recursive edit -->
            <div v-else-if="item.type === 'media'" class="section-block-media">
              <img
                v-if="getMediaUrl(item)"
                :src="getMediaUrl(item)"
                :alt="item.title"
              />
              <p v-if="item.caption" class="media-caption">
                {{ item.caption }}
              </p>
              <p v-else class="media-caption">
                <em>No media selected</em>
              </p>
            </div>

            <!-- Container section: hint -->
            <div
              v-else-if="item.type === 'container'"
              class="section-block-container-hint"
            >
              <span>Container — {{ getChildCount(item.id) }} sub-sections</span>
            </div>
          </template>
        </div>
        <div v-else class="section-block-placeholder">
          <span class="placeholder-label">{{ item.title || "Untitled" }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { marked } from "marked";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
  watch,
} from "vue";
import { useMediaStore } from "../stores/media";

const props = defineProps({
  section: { type: Object, required: true },
  getChildren: { type: Function, required: true },
  mode: { type: String, default: "view" },
});

const emit = defineEmits(["update-section"]);

const mediaStore = useMediaStore();
const visibleSections = ref(new Set());
const sectionBlocks = ref([]);
const editTabs = reactive({});
let observer = null;

const flatSections = computed(() => {
  const result = [];
  function walk(parentId, depth) {
    const children = props.getChildren(parentId);
    for (const child of children) {
      const raw = toRaw(child);
      result.push({
        id: raw.id,
        bookId: raw.bookId,
        parentId: raw.parentId,
        type: raw.type,
        title: raw.title,
        content: raw.content,
        mediaId: raw.mediaId,
        caption: raw.caption,
        orderIndex: raw.orderIndex,
        depth,
      });
      walk(raw.id, depth + 1);
    }
  }
  walk(props.section.id, 0);
  return result;
});

function getIcon(item) {
  switch (item.type) {
    case "container":
      return "bi bi-folder";
    case "media":
      return "bi bi-image";
    default:
      return "bi bi-file-text";
  }
}

function getChildCount(parentId) {
  return props.getChildren(parentId).length;
}

function renderMarkdown(content, bookId) {
  if (!content) return "";
  const renderer = new marked.Renderer();
  renderer.image = ({ href, text }) => {
    if (!href) return "";
    // Skip absolute URLs (http/https/data URIs)
    if (/^(https?:\/\/|data:)/.test(href)) {
      return `<img src="${href}" alt="${text || ""}" />`;
    }
    if (!bookId) {
      return `<img src="${href}" alt="${text || ""}" />`;
    }
    // Try to resolve as media slug (with or without extension)
    const slug = href.replace(/\.[^/.]+$/, "");
    const media =
      mediaStore.getMediaBySlug(bookId, slug) ||
      mediaStore.getMediaBySlug(bookId, href);
    if (media) {
      const url = buildMediaUrl(bookId, media.id);
      return `<img src="${url}" alt="${text || ""}" />`;
    }
    return `<img src="${href}" alt="${text || ""}" />`;
  };
  return marked(content, { breaks: true, renderer });
}

function buildMediaUrl(bookId, mediaId) {
  const base = `/api/books/${bookId}/media/${mediaId}/file`;
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      return `${base}?token=${encodeURIComponent(token)}`;
    }
  }
  return base;
}

function getMediaUrl(item) {
  if (!item.mediaId || !item.bookId) return null;
  return buildMediaUrl(item.bookId, item.mediaId);
}

function onTitleBlur(item, event) {
  const newTitle = event.target.value;
  if (newTitle !== item.title) {
    emit("update-section", { sectionId: item.id, data: { title: newTitle } });
  }
}

function onContentBlur(item, event) {
  const newContent = event.target.value;
  if (newContent !== item.content) {
    emit("update-section", {
      sectionId: item.id,
      data: { content: newContent },
    });
  }
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function onContentInput(item, event) {
  autoResize(event.target);
}

function setupObserver() {
  cleanupObserver();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const sectionId = entry.target.dataset.sectionId;
        if (entry.isIntersecting) {
          visibleSections.value.add(sectionId);
        }
      }
      // Trigger reactivity
      visibleSections.value = new Set(visibleSections.value);
    },
    {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0,
    },
  );

  // Observe after DOM update
  nextTick(() => {
    if (sectionBlocks.value) {
      for (const el of sectionBlocks.value) {
        if (el) observer.observe(el);
      }
    }
  });
}

function cleanupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

watch(
  () => flatSections.value.length,
  () => {
    setupObserver();
  },
);

onMounted(() => {
  setupObserver();
});

onBeforeUnmount(() => {
  cleanupObserver();
});
</script>

<style scoped>
.section-recursive-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.empty-recursive {
  display: grid;
  place-items: center;
  flex: 1;
  text-align: center;
  color: var(--pico-muted-color);
  gap: var(--space-sm);
}

.empty-recursive i {
  font-size: var(--text-icon, 3rem);
}

.recursive-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-bottom: var(--space-xl);
  align-items: stretch;
}

.section-block {
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  min-height: 60px;
  flex-shrink: 0;
}

.section-block.editing {
  border-color: var(--pico-primary, #1095c1);
  border-style: dashed;
}

.section-block-content {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.section-block-placeholder {
  padding: var(--space-md);
  display: flex;
  align-items: center;
  color: var(--pico-muted-color);
  opacity: 0.5;
}

.placeholder-label {
  font-style: italic;
  font-size: var(--text-sm);
}

.section-block-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.title-depth-0 {
  font-size: var(--text-xl);
}

.title-depth-1 {
  font-size: var(--text-lg);
}

.title-depth-2 {
  font-size: var(--text-md);
}

.title-depth-3,
.title-depth-4 {
  font-size: var(--text-sm);
}

.depth-0 {
  margin-left: 0;
}

.depth-1 {
  margin-left: var(--space-md);
}

.depth-2 {
  margin-left: calc(var(--space-md) * 2);
}

.depth-3 {
  margin-left: calc(var(--space-md) * 3);
}

.depth-4 {
  margin-left: calc(var(--space-md) * 4);
}

.section-block-text {
  line-height: var(--leading-relaxed, 1.6);
  font-size: var(--text-md);
  min-width: 0;
  overflow-wrap: break-word;
}

.section-block-text :deep(p) {
  margin: var(--space-xs) 0;
}

.section-block-text :deep(h1),
.section-block-text :deep(h2),
.section-block-text :deep(h3) {
  margin-top: var(--space-md);
}

.section-block-text :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-sm, 4px);
  display: block;
  margin: var(--space-sm) 0;
}

.section-block-media {
  min-width: 0;
}

.section-block-media img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-sm, 4px);
  display: block;
}

.media-caption {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  font-style: italic;
}

.section-block-container-hint {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  opacity: 0.7;
}

/* ===== Edit mode styles ===== */
.edit-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.edit-icon {
  color: var(--pico-muted-color);
  flex-shrink: 0;
}

.edit-title-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: var(--space-2xs) var(--space-xs);
  margin: 0;
  font-weight: var(--weight-semibold, 600);
  min-width: 0;
}

.edit-title-input:focus {
  outline: 2px solid var(--pico-primary);
  border-radius: var(--radius-sm, 4px);
}

.edit-tabs {
  display: flex;
  gap: var(--space-2xs);
  flex-shrink: 0;
}

.edit-tabs button {
  background: none;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  padding: var(--space-2xs) var(--space-xs);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.edit-tabs button.active {
  border-bottom-color: var(--pico-primary);
  color: var(--pico-primary);
}

.edit-content-textarea {
  width: 100%;
  min-height: 40px;
  resize: none;
  overflow: hidden;
  font-family: var(--font-mono, monospace);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed, 1.6);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-sm);
}

.edit-content-textarea:focus {
  outline: 2px solid var(--pico-primary);
  border-color: transparent;
}
</style>
