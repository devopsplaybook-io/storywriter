<template>
  <div id="book-detail-layout" :class="'mode-' + activePanel">
    <!-- Top navigation bar (always visible) -->
    <nav id="book-nav">
      <NuxtLink to="/" class="back-link">
        <i class="bi bi-arrow-left" />
      </NuxtLink>
      <h2>{{ book?.name }}</h2>
      <button
        v-if="activePanel === 'sections'"
        id="sidebar-toggle"
        class="actions"
        @click="toggleSidebar()"
      >
        <i
          class="bi bi-layout-sidebar"
          :class="{ 'toggle-active': sidebarOpen }"
        />
      </button>
      <div class="nav-tab-actions">
        <button
          class="btn-icon"
          :class="{ active: activePanel === 'sections' }"
          title="Sections"
          @click="activePanel = 'sections'"
        >
          <i class="bi bi-list-nested" />
        </button>
        <button
          class="btn-icon"
          :class="{ active: activePanel === 'attributes' }"
          title="Attributes"
          @click="activePanel = 'attributes'"
        >
          <i class="bi bi-card-text" />
        </button>
        <button
          class="btn-icon"
          :class="{ active: activePanel === 'properties' }"
          title="Properties"
          @click="activePanel = 'properties'"
        >
          <i class="bi bi-sliders" />
        </button>
        <button
          class="btn-icon"
          :class="{ active: activePanel === 'media' }"
          title="Media"
          @click="activePanel = 'media'"
        >
          <i class="bi bi-image" />
        </button>
        <button
          class="btn-icon btn-analyze"
          :class="{ analyzing: analyzingBook }"
          title="Analyze Book"
          :disabled="analyzingBook"
          @click="analyzeBook"
        >
          <i class="bi bi-lightbulb" :class="{ spin: analyzingBook }" />
        </button>
        <button
          class="btn-icon"
          title="Save Version"
          @click="showSaveVersionDialog = true"
        >
          <i class="bi bi-save" />
        </button>
        <button
          class="btn-icon"
          title="Version History"
          @click="showVersionsDialog = true"
        >
          <i class="bi bi-clock-history" />
        </button>
      </div>
    </nav>

    <!-- Sidebar: only for sections -->
    <aside
      v-if="activePanel === 'sections'"
      id="sidebar-panel"
      :class="{ 'sidebar-closed': !sidebarOpen }"
    >
      <SectionTree
        :root-section="sectionsStore.rootSection"
        :selected-id="selectedSectionId"
        :get-children="sectionsStore.getChildren"
        @select="selectSection"
        @add-child="addChildSection"
        @delete="confirmDeleteSection"
      />
    </aside>

    <!-- Editor: only for sections -->
    <main v-if="activePanel === 'sections'" id="editor-panel">
      <div v-if="loading" class="loading-indicator" />
      <template v-else-if="book">
        <SectionEditor
          :section="currentSection"
          :media-list="mediaList"
          @update="updateSection"
        />
      </template>
      <div v-else class="not-found">
        <i class="bi bi-exclamation-circle" />
        <p>Book not found.</p>
        <NuxtLink to="/">Back to Books</NuxtLink>
      </div>
    </main>

    <!-- Full-width panel content: for attributes, properties, media -->
    <div v-if="activePanel !== 'sections'" id="panel-content">
      <PropertyEditor v-if="activePanel === 'properties'" :book-id="book?.id" />

      <BookAttributesEditor
        v-if="activePanel === 'attributes'"
        :book-id="book?.id"
      />

      <MediaGallery
        v-if="activePanel === 'media' && book"
        :book-id="book.id"
        :selected-id="selectedMediaId"
        @select="selectMedia"
      />
    </div>

    <!-- Versions Dialog -->
    <BookVersionsDialog
      :open="showVersionsDialog"
      :book-id="book?.id"
      @close="showVersionsDialog = false"
      @load-version="handleLoadVersion"
      @close-version="handleCloseVersion"
      @restored="handleVersionRestored"
    />

    <!-- Save Version Dialog -->
    <dialog :open="showSaveVersionDialog">
      <article>
        <header>
          <h3>Save Version</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="showSaveVersionDialog = false"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>Create a new snapshot of the entire book.</p>
        <label>
          Version Note
          <textarea
            v-model="versionNote"
            placeholder="What changed in this version?"
            rows="3"
          />
        </label>
        <footer class="dialog-footer">
          <button class="secondary" @click="showSaveVersionDialog = false">
            Cancel
          </button>
          <button
            :aria-busy="savingVersion"
            :disabled="savingVersion"
            @click="handleSaveVersion"
          >
            Save Version
          </button>
        </footer>
      </article>
    </dialog>

    <!-- Analysis Dialog -->
    <dialog :open="showAnalysis">
      <article class="analysis-dialog">
        <header>
          <div class="analysis-header">
            <h3><i class="bi bi-lightbulb" /> Book Analysis</h3>
            <div class="analysis-header-actions">
              <button
                class="btn-icon"
                title="Regenerate analysis"
                :disabled="analyzingBook"
                @click="analyzeBook"
              >
                <i
                  class="bi bi-arrow-clockwise"
                  :class="{ spin: analyzingBook }"
                />
              </button>
              <button class="btn-icon" @click="showAnalysis = false">
                <i class="bi bi-x-lg" />
              </button>
            </div>
          </div>
          <p v-if="analysisResult?.generatedAt" class="analysis-date">
            Generated:
            {{ new Date(analysisResult.generatedAt).toLocaleString() }}
          </p>
        </header>

        <div v-if="analyzingBook" class="analysis-loading">
          <div class="loading-indicator" />
          <p>Analyzing your book... This may take a moment.</p>
        </div>

        <div v-else-if="analysisResult" class="analysis-content">
          <!-- Tab toggle -->
          <div v-if="analysisResult.rawOutput" class="analysis-tabs">
            <button
              :class="{ active: !showRawAnalysis }"
              @click="showRawAnalysis = false"
            >
              <i class="bi bi-card-text" /> Formatted
            </button>
            <button
              :class="{ active: showRawAnalysis }"
              @click="showRawAnalysis = true"
            >
              <i class="bi bi-code-slash" /> Raw Output
            </button>
          </div>

          <!-- Formatted view (parsed sections) -->
          <template v-if="!showRawAnalysis">
            <section v-if="analysisResult.summary" class="analysis-section">
              <h4>Summary</h4>
              <div v-html="renderMarkdown(analysisResult.summary)" />
            </section>
            <section v-if="analysisResult.strengths" class="analysis-section">
              <h4>Strengths</h4>
              <div v-html="renderMarkdown(analysisResult.strengths)" />
            </section>
            <section
              v-if="analysisResult.improvements"
              class="analysis-section"
            >
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
              No analysis available yet. Click the lightbulb to generate one.
            </p>
          </template>

          <!-- Raw output view -->
          <div v-else class="analysis-raw">
            <pre
              class="raw-output"
            ><code>{{ analysisResult.rawOutput }}</code></pre>
          </div>
        </div>
      </article>
    </dialog>

    <!-- Delete Section Confirmation -->
    <dialog :open="deleteSectionTarget !== null">
      <article>
        <header>
          <h3>Delete Section</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="deleteSectionTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>
          Are you sure you want to delete this section and all its children?
          This cannot be undone.
        </p>
        <footer class="dialog-footer">
          <button class="secondary" @click="deleteSectionTarget = null">
            Cancel
          </button>
          <button class="contrast" @click="deleteSection">Delete</button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
import { marked } from "marked";
import { useMediaStore } from "../../stores/media";
import { usePropertiesStore } from "../../stores/properties";

const route = useRoute();
const booksStore = useBooksStore();
const sectionsStore = useSectionsStore();
const mediaStore = useMediaStore();
const propertiesStore = usePropertiesStore();

const loading = ref(true);
const book = ref(null);
const selectedSectionId = ref(null);
const selectedMediaId = ref(null);
const showVersionsDialog = ref(false);
const showSaveVersionDialog = ref(false);
const versionNote = ref("");
const savingVersion = ref(false);
const viewingVersionId = ref(null);
const activePanel = ref("sections");
const deleteSectionTarget = ref(null);
const sidebarOpen = ref(true);
const analyzingBook = ref(false);
const showAnalysis = ref(false);
const analysisResult = ref(null);
const showRawAnalysis = ref(false);

// Auto-detect mobile and start with sidebar closed
function checkMobile() {
  return window.innerWidth < 769;
}

const mediaList = computed(() => {
  if (!book.value) return [];
  return mediaStore.getMediaForBook(book.value.id);
});

function selectMedia(media) {
  selectedMediaId.value = media?.id || null;
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

const currentSection = computed(() => {
  if (!selectedSectionId.value) return null;
  return (
    sectionsStore.sections.find((s) => s.id === selectedSectionId.value) || null
  );
});

async function loadBook() {
  loading.value = true;
  try {
    const bookId = route.params.id;
    book.value = await booksStore.fetchById(bookId);
    await sectionsStore.fetchByBook(bookId);
    await mediaStore.fetchMedia(bookId);
    await propertiesStore.fetchByBook(bookId);
    // Auto-select root section
    if (sectionsStore.rootSection) {
      selectedSectionId.value = sectionsStore.rootSection.id;
    }
  } catch {
    book.value = null;
  } finally {
    loading.value = false;
  }
}

function selectSection(id) {
  selectedSectionId.value = id;
  // On mobile, close sidebar after selecting a section
  if (checkMobile()) {
    sidebarOpen.value = false;
  }
}

async function addChildSection(parentId) {
  try {
    const children = sectionsStore.getChildren(parentId);
    const section = await sectionsStore.create(
      book.value.id,
      parentId,
      "text",
      "New Section",
      children.length,
    );
    selectedSectionId.value = section.id;
    if (checkMobile()) {
      sidebarOpen.value = false;
    }
  } catch {
    // silent
  }
}

async function updateSection(data) {
  if (!selectedSectionId.value) return;
  try {
    await sectionsStore.update(selectedSectionId.value, data);
  } catch {
    // silent
  }
}

async function handleSaveVersion() {
  if (!book.value) return;
  savingVersion.value = true;
  try {
    await booksStore.createVersion(book.value.id, versionNote.value);
    showSaveVersionDialog.value = false;
    versionNote.value = "";
  } catch {
    // silent
  } finally {
    savingVersion.value = false;
  }
}

function handleLoadVersion(versionId) {
  viewingVersionId.value = versionId;
  showVersionsDialog.value = false;
}

function handleCloseVersion() {
  viewingVersionId.value = null;
  if (book.value) {
    sectionsStore.fetchByBook(book.value.id);
  }
}

async function handleVersionRestored() {
  if (book.value) {
    await loadBook();
  }
}

function confirmDeleteSection(id) {
  if (sectionsStore.rootSection?.id === id) {
    alert("Cannot delete the root section.");
    return;
  }
  deleteSectionTarget.value = id;
}

async function deleteSection() {
  if (!deleteSectionTarget.value) return;
  try {
    await sectionsStore.remove(deleteSectionTarget.value);
    if (selectedSectionId.value === deleteSectionTarget.value) {
      selectedSectionId.value = sectionsStore.rootSection?.id || null;
    }
    deleteSectionTarget.value = null;
  } catch {
    // silent
  }
}

function renderMarkdown(text) {
  if (!text) return "";
  return marked(text);
}

async function analyzeBook() {
  if (!book.value || analyzingBook.value) return;
  showAnalysis.value = true;
  analyzingBook.value = true;
  showRawAnalysis.value = false;
  try {
    analysisResult.value = await booksStore.analyzeBook(book.value.id);
  } catch (err) {
    analysisResult.value = {
      generatedAt: null,
      bookId: book.value.id,
      bookName: book.value.name,
      summary: `Analysis failed: ${err.message || "Unknown error"}`,
      strengths: null,
      improvements: null,
      suggestions: null,
    };
  } finally {
    analyzingBook.value = false;
  }
}

onMounted(async () => {
  // Start with sidebar closed on mobile
  if (checkMobile()) {
    sidebarOpen.value = false;
  }
  await loadBook();
  // Load cached analysis if available
  if (book.value) {
    try {
      const cached = await booksStore.fetchAnalysis(book.value.id);
      if (cached.generatedAt) {
        analysisResult.value = cached;
      }
    } catch {
      // no cached analysis
    }
  }
});

// React to viewport changes
onMounted(() => {
  window.addEventListener("resize", () => {
    if (!checkMobile() && !sidebarOpen.value) {
      sidebarOpen.value = true;
    }
  });
});
</script>

<style scoped>
/* ============================================
   Layout grid — shared across breakpoints
   ============================================ */
#book-detail-layout {
  display: grid;
  height: 100%;
  gap: var(--space-sm);
}

/* ============================================
   Desktop layout (min-width: 769px)
   ============================================ */
@media (min-width: 769px) {
  /* Sections mode: nav on top, sidebar + editor below */
  #book-detail-layout.mode-sections {
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(240px, 300px) 1fr;
    grid-template-areas:
      "nav nav"
      "sidebar editor";
  }

  #book-detail-layout.mode-sections #book-nav {
    grid-area: nav;
  }

  /* Other modes: nav on top, full-width panel below */
  #book-detail-layout.mode-attributes,
  #book-detail-layout.mode-properties,
  #book-detail-layout.mode-media {
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
    grid-template-areas:
      "nav"
      "panel";
  }

  #book-detail-layout.mode-attributes #book-nav,
  #book-detail-layout.mode-properties #book-nav,
  #book-detail-layout.mode-media #book-nav {
    grid-area: nav;
  }

  #sidebar-toggle {
    display: none;
  }

  #sidebar-panel {
    grid-area: sidebar;
    overflow-y: auto;
    border-right: 1px solid var(--pico-muted-border-color, #444);
    padding-right: var(--space-sm);
  }

  #editor-panel {
    grid-area: editor;
    overflow-y: auto;
  }

  #panel-content {
    grid-area: panel;
    overflow-y: auto;
    max-width: 900px;
  }
}

/* ============================================
   Mobile layout (max-width: 768px)
   ============================================ */
@media (max-width: 768px) {
  /* Sections mode: nav, collapsible sidebar, editor */
  #book-detail-layout.mode-sections {
    grid-template-rows: auto auto 1fr;
    grid-template-columns: 1fr;
  }

  /* Other modes: nav, full content */
  #book-detail-layout.mode-attributes,
  #book-detail-layout.mode-properties,
  #book-detail-layout.mode-media {
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
  }

  #sidebar-toggle {
    display: flex;
    align-items: center;
    padding: var(--space-xs);
    font-size: var(--text-xl);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--pico-muted-color);
  }

  #sidebar-toggle:hover {
    color: var(--pico-primary);
  }

  .toggle-active {
    color: var(--pico-primary) !important;
  }

  #sidebar-panel {
    overflow: auto;
    max-height: 50vh;
    transition:
      max-height 0.3s ease,
      opacity 0.3s ease;
    border: 1px solid var(--pico-muted-border-color, #444);
    border-radius: var(--radius-sm, 4px);
    padding: var(--space-sm);
    background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  }

  #sidebar-panel.sidebar-closed {
    max-height: 0 !important;
    overflow: hidden;
    border: none;
    padding: 0;
    opacity: 0;
  }

  #editor-panel {
    overflow-y: auto;
  }

  #panel-content {
    overflow-y: auto;
  }
}

/* ============================================
   Nav bar
   ============================================ */
#book-nav {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--pico-muted-border-color, #444);
}

#book-nav h2 {
  margin: 0;
  font-size: var(--text-lg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.nav-tab-actions {
  display: flex;
  gap: var(--space-2xs);
}

/* ============================================
   Icon buttons
   ============================================ */
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

.btn-icon.active {
  color: var(--pico-primary);
  border-color: var(--pico-primary);
}

.back-link {
  text-decoration: none;
  font-size: var(--text-lg);
  color: var(--pico-muted-color);
}

.back-link:hover {
  color: var(--pico-primary);
}

/* ============================================
   States
   ============================================ */
.not-found {
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--pico-muted-color);
  gap: var(--space-sm);
}

.not-found i {
  font-size: var(--text-icon, 3rem);
}

/* ============================================
   Analyze button
   ============================================ */
.btn-analyze {
  color: #d4a017;
}

.btn-analyze:hover {
  color: #f0c040 !important;
  border-color: #d4a017 !important;
}

.btn-analyze.analyzing {
  opacity: 0.6;
  cursor: wait;
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

/* ============================================
   Analysis dialog
   ============================================ */
.analysis-dialog {
  max-width: 720px;
  max-height: 85vh;
  overflow-y: auto;
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.analysis-header-actions {
  display: flex;
  gap: var(--space-2xs);
}

.analysis-date {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
}

.analysis-loading {
  text-align: center;
  padding: var(--space-lg) 0;
  color: var(--pico-muted-color);
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

.analysis-content {
  padding-top: var(--space-sm);
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

.analysis-empty {
  text-align: center;
  color: var(--pico-muted-color);
  padding: var(--space-md) 0;
}
</style>
