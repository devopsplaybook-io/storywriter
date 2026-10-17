<template>
  <div class="book-search">
    <div class="search-box">
      <i class="bi bi-search" />
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        class="search-input"
        placeholder="Search this book…"
        @keydown.esc.prevent="clearQuery"
        @keydown.enter.prevent="selectFirst"
      />
      <button
        v-if="query"
        class="clear-btn"
        aria-label="Clear search"
        @click="clearQuery"
      >
        <i class="bi bi-x-lg" />
      </button>
    </div>
    <div v-if="query && results.length" class="search-results">
      <button
        v-for="result in results"
        :key="result.id + result.where"
        class="search-result"
        :title="`Jump to section`"
        @click="$emit('select', result.id)"
      >
        <span class="result-title">
          <i :class="whereIcon(result.where)" />
          {{ result.title || "Untitled" }}
        </span>
        <span class="result-snippet">
          <template v-for="(part, i) in snippetParts(result)" :key="i">
            <mark v-if="part.match">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
      </button>
      <p v-if="truncated" class="results-truncated">
        Showing the first {{ results.length }} results — refine your search.
      </p>
    </div>
    <p v-else-if="query && !results.length" class="no-results">
      No matches in this book.
    </p>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { searchSections } from "../utils/bookSearch";
import { useSectionsStore } from "../stores/sections";

const emit = defineEmits(["select"]);

const query = defineModel({ type: String, default: "" });

const sectionsStore = useSectionsStore();

const searchInput = ref(null);

const results = computed(() =>
  searchSections(sectionsStore.sections, query.value),
);

const truncated = computed(() => results.value.length >= 50);

function whereIcon(where) {
  switch (where) {
    case "title":
      return "bi bi-type-h1";
    case "caption":
      return "bi bi-badge-caption";
    default:
      return "bi bi-file-text";
  }
}

function snippetParts(result) {
  const needle = query.value.trim();
  if (!needle) return [{ text: result.snippet, match: false }];
  const parts = [];
  const lowerSnippet = result.snippet.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let cursor = 0;
  let index = lowerSnippet.indexOf(lowerNeedle);
  while (index >= 0) {
    if (index > cursor) {
      parts.push({ text: result.snippet.slice(cursor, index), match: false });
    }
    parts.push({ text: result.snippet.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = lowerSnippet.indexOf(lowerNeedle, cursor);
  }
  if (cursor < result.snippet.length) {
    parts.push({ text: result.snippet.slice(cursor), match: false });
  }
  return parts;
}

function clearQuery() {
  query.value = "";
}

function selectFirst() {
  if (results.value.length) {
    emit("select", results.value[0].id);
  }
}

function focus() {
  searchInput.value?.focus();
}

defineExpose({ focus });
</script>

<style scoped>
.book-search {
  display: grid;
  gap: var(--space-2xs);
}

.search-box {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: 0 var(--space-2xs);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.search-box i {
  color: var(--pico-muted-color);
}

.search-input {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: var(--space-2xs) 0;
  margin: 0;
  height: auto;
  font-size: var(--text-sm);
  flex: 1;
  min-width: 0;
}

.search-input:focus {
  outline: none;
  border: none;
  box-shadow: none;
}

.clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pico-muted-color);
  padding: var(--space-3xs, 2px) var(--space-2xs);
  font-size: var(--text-xs);
}

.clear-btn:hover {
  color: var(--pico-primary);
}

.search-results {
  display: grid;
  gap: 2px;
  max-height: 40vh;
  overflow-y: auto;
}

.search-result {
  display: grid;
  gap: 2px;
  text-align: left;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-2xs) var(--space-xs);
  cursor: pointer;
  color: inherit;
  font-size: var(--text-sm);
}

.search-result:hover {
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.05));
  border-color: var(--pico-muted-border-color, #444);
}

.result-title {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-snippet {
  color: var(--pico-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-snippet mark {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.3));
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

.no-results,
.results-truncated {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  padding: var(--space-2xs) var(--space-xs);
  margin: 0;
}
</style>
