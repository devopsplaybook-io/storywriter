<template>
  <div class="analysis-viewer">
    <header class="analysis-header">
      <h3><i class="bi bi-lightbulb" /> Book Analysis</h3>
      <button
        class="btn-small"
        :aria-busy="generating"
        :disabled="generating || !llmAvailable"
        :title="llmAvailable ? null : aiUnavailableTitle"
        @click="generate"
      >
        <i class="bi bi-arrow-clockwise" :class="{ spin: generating }" />
        {{ analysisResult ? "Regenerate" : "Generate Analysis" }}
      </button>
    </header>

    <!-- LLM not configured on this server -->
    <p v-if="!llmAvailable" class="analysis-unavailable">
      <i class="bi bi-info-circle" />
      {{ aiUnavailableTitle }}
    </p>

    <!-- Error state (kept above the cached report so the last good report stays visible) -->
    <div v-if="error" class="analysis-error">
      <p>{{ error }}</p>
    </div>

    <!-- Loading state: only when there is no cached report to keep visible -->
    <div v-if="generating && !analysisResult" class="analysis-loading">
      <div class="loading-indicator" />
      <p>Analyzing your book... This may take a moment.</p>
    </div>

    <!-- No analysis state -->
    <div
      v-else-if="!analysisResult && !generating"
      class="analysis-empty"
    >
      <i class="bi bi-lightbulb" />
      <p>No analysis yet. Click Generate to analyze your book.</p>
      <button
        :aria-busy="generating"
        :disabled="generating || !llmAvailable"
        :title="llmAvailable ? null : aiUnavailableTitle"
        @click="generate"
      >
        <i class="bi bi-stars" /> Generate Analysis
      </button>
    </div>

    <!-- Analysis content (stays visible during regeneration, under an overlay) -->
    <div v-else class="analysis-body">
      <template v-if="analysisResult">
        <!-- Timestamp -->
        <p class="analysis-date" v-if="analysisResult.generatedAt">
          Generated:
          {{ new Date(analysisResult.generatedAt).toLocaleString() }}
        </p>

        <!-- Staleness hint -->
        <p v-if="analysisResult.stale" class="analysis-stale">
          <i class="bi bi-exclamation-triangle" />
          The book changed since this analysis was generated — regenerate it to
          refresh the insights.
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

        <!-- Regeneration overlay -->
        <div v-if="generating" class="regen-overlay">
          <div class="regen-card">
            <div class="loading-indicator" />
            <p>Regenerating analysis…</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { marked } from "marked";
import { useBooksStore } from "../stores/books";
import { useLlmStore } from "../stores/llm";

const props = defineProps({
  bookId: {
    type: String,
    required: true,
  },
});

const booksStore = useBooksStore();
const llmStore = useLlmStore();

const llmAvailable = computed(() => llmStore.available);
const aiUnavailableTitle =
  "AI assistance is not configured on this server (LLM_API_KEY missing) — ask your administrator.";

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
  if (generating.value || !llmAvailable.value) return;
  generating.value = true;
  error.value = null;
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

.analysis-unavailable {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  border: 1px dashed var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
}

.analysis-date {
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
  margin-bottom: var(--space-sm);
}

.analysis-stale {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  font-size: var(--text-sm);
  color: #d4a017;
  margin-bottom: var(--space-md);
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
  margin-bottom: var(--space-md);
  color: var(--pico-del-color, #c0392b);
  border: 1px solid var(--pico-del-color, #c0392b);
  border-radius: var(--radius-sm, 4px);
}

/* Relative container so the regeneration overlay covers the report */
.analysis-body {
  position: relative;
}

.regen-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--pico-background-color, #1a1a1a) 75%, transparent);
  border-radius: var(--radius-sm, 4px);
  z-index: 10;
}

.regen-card {
  display: grid;
  place-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-background-color, #1a1a1a);
  color: var(--pico-muted-color);
}

.regen-card p {
  margin: 0;
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
