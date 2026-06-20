<template>
  <div
    id="book-detail-layout"
    :class="['mode-' + activePanel, { 'sidebar-collapsed': sidebarCollapsed }]"
  >
    <!-- Top navigation bar (always visible) -->
    <nav id="book-nav">
      <NuxtLink to="/" class="back-link">
        <i class="bi bi-arrow-left" />
      </NuxtLink>
      <h2>{{ book?.name }}</h2>
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
          class="btn-icon"
          :class="{ active: activePanel === 'analysis' }"
          title="Analyze Book"
          @click="activePanel = 'analysis'"
        >
          <i class="bi bi-lightbulb" />
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
    <aside v-if="activePanel === 'sections'" id="sidebar-panel">
      <div class="sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
        <span>Sections</span>
        <i
          :class="sidebarCollapsed ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"
        />
      </div>
      <div v-show="!sidebarCollapsed" class="sidebar-tree">
        <SectionTree
          :root-section="sectionsStore.rootSection"
          :selected-id="selectedSectionId"
          :get-children="sectionsStore.getChildren"
          @select="selectSection"
          @add-child="addChildSection"
          @delete="confirmDeleteSection"
        />
      </div>
    </aside>

    <!-- Editor: only for sections -->
    <main v-if="activePanel === 'sections'" id="editor-panel">
      <div v-if="loading" class="loading-indicator" />
      <template v-else-if="book">
        <!-- View mode toggle for container sections -->
        <div
          v-if="currentSection?.type === 'container'"
          class="view-mode-toggle"
        >
          <button
            :class="{ active: sectionViewMode === 'section' }"
            title="Section view — edit this section"
            @click="sectionViewMode = 'section'"
          >
            <i class="bi bi-layout-text-sidebar" /> Section
          </button>
          <button
            :class="{ active: sectionViewMode === 'recursive-view' }"
            title="Recursive view — read all sub-sections"
            @click="sectionViewMode = 'recursive-view'"
          >
            <i class="bi bi-list-task" /> View
          </button>
          <button
            :class="{ active: sectionViewMode === 'recursive-edit' }"
            title="Recursive edit — edit all sub-sections"
            @click="sectionViewMode = 'recursive-edit'"
          >
            <i class="bi bi-pencil-square" /> Edit
          </button>
        </div>

        <!-- Section view: editor (with reorder for containers) -->
        <SectionEditor
          v-if="sectionViewMode === 'section'"
          :section="currentSection"
          :media-list="mediaList"
          :children="currentSectionChildren"
          :get-children="sectionsStore.getChildren"
          @update="updateSection"
          @reorder="handleReorderChildren"
        />

        <!-- Recursive view: read-only nested content -->
        <SectionRecursiveView
          v-else-if="sectionViewMode === 'recursive-view'"
          :section="currentSection"
          :get-children="sectionsStore.getChildren"
          mode="view"
        />

        <!-- Recursive edit: editable nested content -->
        <SectionRecursiveView
          v-else-if="sectionViewMode === 'recursive-edit'"
          :section="currentSection"
          :get-children="sectionsStore.getChildren"
          mode="edit"
          @update-section="handleRecursiveUpdateSection"
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

      <AnalysisViewer
        v-if="activePanel === 'analysis' && book"
        :book-id="book.id"
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
const sidebarCollapsed = ref(true);
const sectionViewMode = ref("section");

// Persist view mode preference per section type
watch(sectionViewMode, (mode) => {
  if (currentSection.value) {
    localStorage.setItem(
      `storywriter.viewMode.${currentSection.value.type}`,
      mode,
    );
  }
});
const deleteSectionTarget = ref(null);

const mediaList = computed(() => {
  if (!book.value) return [];
  return mediaStore.getMediaForBook(book.value.id);
});

function selectMedia(media) {
  selectedMediaId.value = media?.id || null;
}

const currentSection = computed(() => {
  if (!selectedSectionId.value) return null;
  return (
    sectionsStore.sections.find((s) => s.id === selectedSectionId.value) || null
  );
});

const currentSectionChildren = computed(() => {
  if (!currentSection.value) return [];
  return sectionsStore.getChildren(currentSection.value.id);
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
  // Restore saved view mode preference for this section type
  const section = sectionsStore.sections.find((s) => s.id === id);
  if (section) {
    const saved = localStorage.getItem(`storywriter.viewMode.${section.type}`);
    sectionViewMode.value = saved || "section";
  } else {
    sectionViewMode.value = "section";
  }
}

async function addChildSection(parentId, type = "text") {
  const parent = sectionsStore.sections.find((s) => s.id === parentId);
  if (!parent || parent.type !== "container") return;
  try {
    const children = sectionsStore.getChildren(parentId);
    const section = await sectionsStore.create(
      book.value.id,
      parentId,
      type,
      "New Section",
      children.length,
    );
    selectedSectionId.value = section.id;
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

async function handleReorderChildren({ sourceIndex, targetIndex }) {
  if (!currentSection.value) return;
  const children = [...currentSectionChildren.value];
  if (sourceIndex < 0 || sourceIndex >= children.length) return;
  if (targetIndex < 0 || targetIndex >= children.length) return;
  // Move the item
  const [moved] = children.splice(sourceIndex, 1);
  children.splice(targetIndex, 0, moved);
  // Update orderIndex for all affected children
  try {
    for (let i = 0; i < children.length; i++) {
      if (children[i].orderIndex !== i) {
        await sectionsStore.reorder(children[i].id, i);
      }
    }
  } catch {
    // silent — refetch if needed
    await sectionsStore.fetchByBook(book.value.id);
  }
}

async function handleRecursiveUpdateSection({ sectionId, data }) {
  try {
    await sectionsStore.update(sectionId, data);
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

onMounted(async () => {
  await loadBook();
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
  #book-detail-layout.mode-media,
  #book-detail-layout.mode-analysis {
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
    grid-template-areas:
      "nav"
      "panel";
  }

  #book-detail-layout.mode-attributes #book-nav,
  #book-detail-layout.mode-properties #book-nav,
  #book-detail-layout.mode-media #book-nav,
  #book-detail-layout.mode-analysis #book-nav {
    grid-area: nav;
  }

  #sidebar-panel {
    grid-area: sidebar;
    overflow-y: auto;
    border-right: 1px solid var(--pico-muted-border-color, #444);
    padding-right: var(--space-sm);
  }

  /* Desktop: hide sidebar toggle, always show tree */
  .sidebar-toggle {
    display: none;
  }

  #editor-panel {
    grid-area: editor;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
  #book-detail-layout {
    gap: var(--space-xs);
  }

  /* Sections mode: nav, editor, collapsible sidebar at bottom */
  #book-detail-layout.mode-sections {
    grid-template-rows: auto 1fr 35vh;
    grid-template-columns: 1fr;
    min-height: 0;
  }

  /* Collapsed sidebar: just the toggle bar */
  #book-detail-layout.mode-sections.sidebar-collapsed {
    grid-template-rows: auto 1fr auto;
  }

  /* Other modes: nav, full content */
  #book-detail-layout.mode-attributes,
  #book-detail-layout.mode-properties,
  #book-detail-layout.mode-media,
  #book-detail-layout.mode-analysis {
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
  }

  /* Compact nav on mobile */
  #book-nav {
    padding-bottom: var(--space-xs);
    gap: var(--space-xs);
  }

  #book-nav h2 {
    font-size: var(--text-base);
  }

  .btn-icon {
    padding: var(--space-3xs, 2px) var(--space-2xs);
    font-size: var(--text-base);
  }

  #sidebar-panel {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--pico-muted-border-color, #444);
    border-radius: var(--radius-sm, 4px);
    background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  }

  .sidebar-tree {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: var(--space-xs) var(--space-sm);
  }

  /* Compact view mode toggle */
  .view-mode-toggle {
    padding-bottom: var(--space-2xs);
  }

  .view-mode-toggle button {
    padding: var(--space-3xs, 2px) var(--space-xs);
    font-size: var(--text-xs);
  }

  #editor-panel {
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
   View mode toggle
   ============================================ */
.view-mode-toggle {
  display: flex;
  gap: var(--space-2xs);
  border-bottom: 1px solid var(--pico-muted-border-color, #444);
  padding-bottom: var(--space-xs);
  flex-shrink: 0;
}

.view-mode-toggle button {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  padding: var(--space-2xs) var(--space-sm);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  white-space: nowrap;
}

.view-mode-toggle button:hover {
  border-color: var(--pico-muted-border-color, #444);
  color: var(--pico-primary);
}

.view-mode-toggle button.active {
  color: var(--pico-primary);
  border-color: var(--pico-primary);
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.08));
}

/* ============================================
   Sidebar toggle (visible on mobile only)
   ============================================ */
.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--pico-muted-color);
  user-select: none;
  flex-shrink: 0;
}

.sidebar-toggle:hover {
  color: var(--pico-primary);
}

.sidebar-toggle i {
  font-size: var(--text-xs);
}
</style>
