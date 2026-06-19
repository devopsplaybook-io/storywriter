<template>
  <div class="analysis-viewer">
    <header class="analysis-header">
      <h3><i class="bi bi-lightbulb" /> Book Analysis</h3>
      <button
        class="btn-small"
        :aria-busy="generating"
        :disabled="generating"
        @click="generate"
      >
        <i class="bi bi-arrow-clockwise" :class="{ spin: generating }" />
        {{ analysisResult ? "Regenerate" : "Generate Analysis" }}
      </button>
    </header>

    <!-- Loading state -->
    <div v-if="generating" class="analysis-loading">
      <div class="loading-indicator" />
      <p>Analyzing your book... This may take a moment.</p>
    </div>

    <!-- No analysis state -->
    <div v-else-if="!analysisResult && !error" class="analysis-empty">
      <i class="bi bi-lightbulb" />
      <p>No analysis yet. Click Generate to analyze your book.</p>
      <button :aria-busy="generating" :disabled="generating" @click="generate">
        <i class="bi bi-stars" /> Generate Analysis
      </button>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="analysis-error">
      <p>{{ error }}</p>
    </div>

    <!-- Analysis content -->
    <template v-else-if="analysisResult">
      <!-- Timestamp -->
      <p class="analysis-date" v-if="analysisResult.generatedAt">
        Generated:
        {{ new Date(analysisResult.generatedAt).toLocaleString() }}
      </p>

      <!-- Tab toggle -->
      <div v-if="analysisResult.rawOutput" class="analysis-tabs">
        <button :class="{ active: !showRaw }" @click="showRaw = false">
          <i class="bi bi-card-text" /> Formatted
        </button>
        <button :class="{ active: showRaw }" @click="showRaw = true">
          <i class="bi bi-code-slash" /> Raw Output
        </button>
      </div>

      <!-- Formatted view -->
      <template v-if="!showRaw">
        <section v-if="analysisResult.summary" class="analysis-section">
          <h4>Summary</h4>
          <div v-html="renderMarkdown(analysisResult.summary)" />
        </section>
        <section v-if="analysisResult.strengths" class="analysis-section">
          <h4>Strengths</h4>
          <div v-html="renderMarkdown(analysisResult.strengths)" />
        </section>
        <section v-if="analysisResult.improvements" class="analysis-section">
          <h4>Areas for Improvement</h4>
          <div v-html="renderMarkdown(analysisResult.improvements)" />
        </section>
        <section v-if="analysisResult.suggestions" class="analysis-section">
          <h4>Suggestions</h4>
          <div v-html="renderMarkdown(analysisResult.suggestions)" />
        </section>
        <p
          v-if="
            !analysisResult.summary &&
            !analysisResult.strengths &&
            !analysisResult.improvements &&
            !analysisResult.suggestions
          "
          class="analysis-empty"
        >
          No analysis content available.
        </p>
      </template>

      <!-- Raw output view -->
      <div v-else class="analysis-raw">
        <pre
          class="raw-output"
        ><code>{{ analysisResult.rawOutput }}</code></pre>
      </div>
    </template>
  </div>
</template>

<script setup>
import { marked } from "marked";
import { useBooksStore } from "../stores/books";

const props = defineProps({
  bookId: {
    type: String,
    required: true,
  },
});

const booksStore = useBooksStore();

const analysisResult = ref(null);
const generating = ref(false);
const error = ref(null);
const showRaw = ref(false);

function renderMarkdown(text) {
  if (!text) return "";
  return marked(text);
}

async function loadCachedAnalysis() {
  try {
    const cached = await booksStore.fetchAnalysis(props.bookId);
    if (cached.generatedAt) {
      analysisResult.value = cached;
    }
  } catch {
    // no cached analysis
  }
}

async function generate() {
  if (generating.value) return;
  generating.value = true;
  error.value = null;
  showRaw.value = false;
  try {
    analysisResult.value = await booksStore.analyzeBook(props.bookId);
  } catch (err) {
    error.value = err.response?.data?.error || err.message || "Analysis failed";
  } finally {
    generating.value = false;
  }
}

onMounted(() => {
  loadCachedAnalysis();
});
</script>

<style scoped>
.analysis-viewer {
  max-width: 720px;
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.analysis-header h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.analysis-header h3 i {
  color: #d4a017;
}

.analysis-date {
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
  margin-bottom: var(--space-sm);
}

.analysis-loading {
  text-align: center;
  padding: var(--space-lg) 0;
  color: var(--pico-muted-color);
}

.analysis-empty {
  display: grid;
  place-items: center;
  text-align: center;
  padding: var(--space-lg);
  color: var(--pico-muted-color);
  gap: var(--space-sm);
}

.analysis-empty i {
  font-size: var(--text-icon, 3rem);
}

.analysis-error {
  padding: var(--space-md);
  color: var(--pico-del-color, #c0392b);
  border: 1px solid var(--pico-del-color, #c0392b);
  border-radius: var(--radius-sm, 4px);
}

.analysis-tabs {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
  border-bottom: 1px solid var(--pico-muted-border-color, #444);
  padding-bottom: var(--space-xs);
}

.analysis-tabs button {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.analysis-tabs button.active {
  border-bottom-color: var(--pico-primary);
  color: var(--pico-primary);
}

.analysis-raw {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

.raw-output {
  margin: 0;
  padding: var(--space-sm);
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed, 1.6);
  white-space: pre-wrap;
  word-break: break-word;
}

.analysis-section {
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--pico-muted-border-color, #444);
}

.analysis-section:last-child {
  border-bottom: none;
}

.analysis-section h4 {
  margin: 0 0 var(--space-xs);
  color: var(--pico-primary);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: spin 1s linear infinite;
}
</style>
