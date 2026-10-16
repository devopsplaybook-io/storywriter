<template>
  <div
    id="book-detail-layout"
    :class="[
      'mode-' + activePanel,
      { 'sidebar-collapsed': effectiveSidebarCollapsed },
    ]"
    :style="sectionsGridStyle"
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
          @move="handleTreeMove"
          @reorder="handleTreeReorder"
          @rename="handleRename"
          @duplicate="handleDuplicate"
          @move-to="handleMoveTo"
          @delete="confirmDeleteSection"
        />
      </div>
    </aside>

    <!-- Resize handle (desktop only) -->
    <div
      v-if="activePanel === 'sections' && !isMobile"
      class="sidebar-resize-handle"
      @mousedown="startResize"
    />

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

    <!-- Rename Section Dialog -->
    <dialog :open="renameTarget !== null">
      <article>
        <header>
          <h3>Rename Section</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="renameTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <label>
          Title
          <input v-model="renameTitle" type="text" @keyup.enter="confirmRename" />
        </label>
        <footer class="dialog-footer">
          <button class="secondary" @click="renameTarget = null">Cancel</button>
          <button @click="confirmRename">Rename</button>
        </footer>
      </article>
    </dialog>

    <!-- Move Section Dialog (keyboard/touch-accessible alternative to drag-and-drop) -->
    <dialog :open="moveToTarget !== null">
      <article>
        <header>
          <h3>Move Section</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="moveToTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>Choose a destination container. The section is added at the end of it.</p>
        <label>
          Destination
          <select v-model="moveToParentId">
            <option value="" disabled>Select a container…</option>
            <option
              v-for="option in moveToOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ moveOptionLabel(option) }}
            </option>
          </select>
        </label>
        <footer class="dialog-footer">
          <button class="secondary" @click="moveToTarget = null">Cancel</button>
          <button :disabled="!moveToParentId" @click="confirmMoveTo">Move</button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
import { useMediaStore } from "../../stores/media";
import { usePropertiesStore } from "../../stores/properties";
import { useSaveStatusStore } from "../../stores/saveStatus";
import { useToastsStore } from "../../stores/toasts";
import { clearDraft } from "../../utils/drafts";
import { isSelfOrDescendant, validMoveTargets } from "../../utils/sectionTree";

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const sectionsStore = useSectionsStore();
const mediaStore = useMediaStore();
const propertiesStore = usePropertiesStore();
const saveStatus = useSaveStatusStore();
const toastsStore = useToastsStore();

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
const sidebarCollapsed = ref(
  typeof window !== "undefined"
    ? localStorage.getItem("storywriter.sidebarCollapsed") === "true"
    : true,
);
const isMobile = ref(
  typeof window !== "undefined" ? window.innerWidth <= 768 : false,
);

// Resizable sidebar width (desktop only)
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 280;
const sidebarWidth = ref(
  typeof window !== "undefined"
    ? Math.min(
        SIDEBAR_MAX,
        Math.max(
          SIDEBAR_MIN,
          Number(localStorage.getItem("storywriter.sidebarWidth")) ||
            SIDEBAR_DEFAULT,
        ),
      )
    : SIDEBAR_DEFAULT,
);
const resizing = ref(false);

const sectionsGridStyle = computed(() => {
  if (activePanel.value !== "sections" || isMobile.value) return {};
  return {
    gridTemplateColumns: `${sidebarWidth.value}px 6px 1fr`,
    gridTemplateAreas: '"nav nav nav" "sidebar handle editor"',
  };
});

function startResize(e) {
  resizing.value = true;
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  function onMouseMove(ev) {
    const delta = ev.clientX - startX;
    sidebarWidth.value = Math.min(
      SIDEBAR_MAX,
      Math.max(SIDEBAR_MIN, startWidth + delta),
    );
  }

  function onMouseUp() {
    resizing.value = false;
    localStorage.setItem("storywriter.sidebarWidth", String(sidebarWidth.value));
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

// Desktop: sidebar always expanded; mobile: use saved preference
const effectiveSidebarCollapsed = computed(() => {
  if (!isMobile.value) return false;
  return sidebarCollapsed.value;
});

// Persist sidebar state for mobile
watch(sidebarCollapsed, (val) => {
  if (isMobile.value) {
    localStorage.setItem("storywriter.sidebarCollapsed", String(val));
  }
});

onMounted(() => {
  const mq = window.matchMedia("(max-width: 768px)");
  const handler = (e) => {
    isMobile.value = e.matches;
  };
  mq.addEventListener("change", handler);
  onBeforeUnmount(() => mq.removeEventListener("change", handler));
});
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
const renameTarget = ref(null);
const renameTitle = ref("");
const moveToTarget = ref(null);
const moveToParentId = ref("");

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
    await propertiesStore.fetchAllSectionValues(bookId);
    // Restore section from URL query param, or fall back to root
    const sectionFromUrl = route.query.section;
    if (
      sectionFromUrl &&
      sectionsStore.sections.find((s) => s.id === sectionFromUrl)
    ) {
      selectSection(sectionFromUrl);
    } else if (sectionsStore.rootSection) {
      selectSection(sectionsStore.rootSection.id);
    }
  } catch {
    book.value = null;
  } finally {
    loading.value = false;
  }
}

function selectSection(id) {
  selectedSectionId.value = id;
  // Sync section ID to URL query parameter
  const query = { ...route.query };
  if (id) {
    query.section = id;
  } else {
    delete query.section;
  }
  router.replace({ query });
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
    selectSection(section.id);
  } catch {
    toastsStore.error("Could not create section.");
  }
}

// Serialize saves per section so an older payload can never land after a newer one
const sectionSaveQueues = new Map();

function queueSectionSave(sectionId, saveFn) {
  const previous = sectionSaveQueues.get(sectionId) || Promise.resolve();
  const run = previous.then(saveFn, saveFn);
  sectionSaveQueues.set(
    sectionId,
    run.catch(() => {}),
  );
  return run;
}

function saveSection(sectionId, data) {
  return queueSectionSave(sectionId, async () => {
    saveStatus.markSaving();
    try {
      await sectionsStore.update(sectionId, data);
      saveStatus.markSaved();
      clearDraft("section", sectionId);
    } catch {
      saveStatus.markError("Section save failed");
      toastsStore.error(
        "Section save failed — your text is kept locally and will retry.",
      );
    }
  });
}

async function updateSection(data) {
  if (!selectedSectionId.value) return;
  await saveSection(selectedSectionId.value, data);
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
    // Refetch so the UI does not keep an optimistic order that failed to persist
    await sectionsStore.fetchByBook(book.value.id);
    toastsStore.error("Could not reorder sections.");
  }
}

async function handleRecursiveUpdateSection({ sectionId, data }) {
  saveStatus.markUnsaved();
  await saveSection(sectionId, data);
}

// ==================== Tree restructuring (drag-and-drop, rename, duplicate, move) ====================

// Build the desired child order of parentId after inserting the moved section at insertIndex
function arrangementForInsert(parentId, movedId, insertIndex) {
  const existing = sectionsStore
    .getChildren(parentId)
    .filter((s) => s.id !== movedId);
  const moved = sectionsStore.sections.find((s) => s.id === movedId);
  if (!moved) return existing;
  const list = [...existing];
  list.splice(Math.max(0, Math.min(insertIndex, list.length)), 0, moved);
  return list;
}

// Persist orderIndexes that differ from the desired sequential order
async function applyArrangement(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].orderIndex !== i) {
      await sectionsStore.reorder(list[i].id, i);
    }
  }
}

async function renumberChildren(parentId) {
  await applyArrangement(sectionsStore.getChildren(parentId));
}

async function handleTreeMove(id, parentId, orderIndex) {
  const section = sectionsStore.sections.find((s) => s.id === id);
  const target = sectionsStore.sections.find((s) => s.id === parentId);
  if (!section || !target || target.type !== "container") return;
  if (section.parentId === null) {
    toastsStore.error("The root section cannot be moved.");
    return;
  }
  if (isSelfOrDescendant(id, parentId, sectionsStore.sections)) {
    toastsStore.error("Cannot move a section into its own subtree.");
    return;
  }
  const oldParentId = section.parentId;
  try {
    const arrangement = arrangementForInsert(parentId, id, orderIndex);
    await sectionsStore.move(id, parentId, orderIndex);
    await applyArrangement(arrangement);
    if (oldParentId !== parentId) {
      await renumberChildren(oldParentId);
    }
  } catch {
    toastsStore.error("Could not move section.");
  } finally {
    // Resync the UI with the server so sibling orderIndexes are never stale
    await sectionsStore.fetchByBook(book.value.id);
  }
}

async function handleTreeReorder(id, parentId, orderIndex) {
  const section = sectionsStore.sections.find((s) => s.id === id);
  if (!section) return;
  if (section.parentId !== parentId) {
    // Drop between siblings of another parent is a cross-parent move
    return handleTreeMove(id, parentId, orderIndex);
  }
  const target = sectionsStore.sections.find((s) => s.id === parentId);
  if (!target || target.type !== "container") return;
  try {
    await applyArrangement(arrangementForInsert(parentId, id, orderIndex));
  } catch {
    await sectionsStore.fetchByBook(book.value.id);
    toastsStore.error("Could not reorder sections.");
  }
}

async function handleDuplicate(id) {
  const section = sectionsStore.sections.find((s) => s.id === id);
  if (!section) return;
  if (section.parentId === null) {
    toastsStore.error("The root section cannot be duplicated.");
    return;
  }
  try {
    const copy = await sectionsStore.copy(
      id,
      section.parentId,
      section.orderIndex + 1,
    );
    // Renumber siblings so the copy sits exactly after the original
    const siblings = sectionsStore
      .getChildren(section.parentId)
      .filter((s) => s.id !== copy.id);
    const origIndex = siblings.findIndex((s) => s.id === id);
    siblings.splice(origIndex + 1, 0, copy);
    await applyArrangement(siblings);
  } catch {
    toastsStore.error("Could not duplicate section.");
  }
}

function handleRename(id) {
  const section = sectionsStore.sections.find((s) => s.id === id);
  if (!section) return;
  renameTarget.value = id;
  renameTitle.value = section.title || "";
}

async function confirmRename() {
  const id = renameTarget.value;
  if (!id) return;
  const title = renameTitle.value.trim();
  if (!title) {
    toastsStore.error("Section title cannot be empty.");
    return;
  }
  try {
    await sectionsStore.update(id, { title });
    renameTarget.value = null;
  } catch {
    toastsStore.error("Could not rename section.");
  }
}

function handleMoveTo(id) {
  const section = sectionsStore.sections.find((s) => s.id === id);
  if (!section) return;
  if (section.parentId === null) {
    toastsStore.error("The root section cannot be moved.");
    return;
  }
  moveToTarget.value = id;
  moveToParentId.value = "";
}

const moveToOptions = computed(() => {
  if (!moveToTarget.value) return [];
  return validMoveTargets(sectionsStore.sections, moveToTarget.value);
});

function moveOptionLabel(section) {
  let depth = 0;
  let current = section;
  while (current && current.parentId) {
    depth += 1;
    current = sectionsStore.sections.find((s) => s.id === current.parentId);
  }
  return `${"—".repeat(depth)} ${section.title || "Untitled"}`.trim();
}

async function confirmMoveTo() {
  const id = moveToTarget.value;
  const parentId = moveToParentId.value;
  if (!id || !parentId) return;
  const childCount = sectionsStore.getChildren(parentId).length;
  moveToTarget.value = null;
  await handleTreeMove(id, parentId, childCount);
}

async function handleSaveVersion() {
  if (!book.value) return;
  savingVersion.value = true;
  try {
    await booksStore.createVersion(book.value.id, versionNote.value);
    showSaveVersionDialog.value = false;
    versionNote.value = "";
  } catch {
    toastsStore.error("Could not save version.");
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
    toastsStore.error("The root section cannot be deleted.");
    return;
  }
  deleteSectionTarget.value = id;
}

async function deleteSection() {
  if (!deleteSectionTarget.value) return;
  try {
    await sectionsStore.remove(deleteSectionTarget.value);
    if (selectedSectionId.value === deleteSectionTarget.value) {
      selectSection(sectionsStore.rootSection?.id || null);
    }
    deleteSectionTarget.value = null;
  } catch {
    toastsStore.error("Could not delete section.");
  }
}

// Warn before leaving with unsaved work
function beforeUnloadGuard(event) {
  if (!saveStatus.isDirty) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => {
  window.addEventListener("beforeunload", beforeUnloadGuard);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnloadGuard);
});

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
  /* Sections mode: nav on top, sidebar + handle + editor below */
  #book-detail-layout.mode-sections {
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(240px, 300px) 6px 1fr;
    grid-template-areas:
      "nav nav nav"
      "sidebar handle editor";
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

  .sidebar-resize-handle {
    grid-area: handle;
    cursor: col-resize;
    background: transparent;
    transition: background var(--transition-fast);
    border-radius: 2px;
  }

  .sidebar-resize-handle:hover,
  .sidebar-resize-handle:active {
    background: var(--pico-primary, #1095c1);
    opacity: 0.4;
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
