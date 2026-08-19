<template>
  <div class="attributes-editor">
    <header class="attr-header">
      <h3><i class="bi bi-card-text" /> Book Attributes</h3>
      <button class="btn-small" @click="addAttribute">
        <i class="bi bi-plus-lg" /> Add
      </button>
    </header>

    <div v-if="loading" class="loading-indicator" />

    <template v-else>
      <div v-if="attributes.length === 0" class="empty-hint">
        <p>
          No attributes yet. Add attributes to define characters, settings,
          lore, or any consistency-driving information for this book.
        </p>
      </div>

      <div v-for="attr in attributes" :key="attr.id" class="attr-card">
        <!-- Collapsed view -->
        <div
          v-if="editingId !== attr.id"
          class="attr-collapsed"
          @click="startEdit(attr)"
        >
          <span class="attr-title">{{ attr.title || "Untitled" }}</span>
          <span class="attr-meta">v{{ attr.version }}</span>
          <span class="attr-actions">
            <i
              class="bi bi-pencil"
              title="Edit"
              @click.stop="startEdit(attr)"
            />
            <i
              class="bi bi-clock-history"
              title="Versions"
              @click.stop="openVersions(attr)"
            />
            <i
              class="bi bi-trash"
              title="Delete"
              @click.stop="confirmDelete(attr)"
            />
          </span>
        </div>

        <!-- Expanded edit view -->
        <div v-else class="attr-edit">
          <input
            v-model="editTitle"
            class="attr-title-input"
            type="text"
            placeholder="Attribute title"
            @keydown.escape="cancelEdit"
          />
          <div class="attr-tabs">
            <button
              :class="{ active: editTab === 'edit' }"
              @click="editTab = 'edit'"
            >
              <i class="bi bi-pencil" /> Edit
            </button>
            <button
              :class="{ active: editTab === 'preview' }"
              @click="editTab = 'preview'"
            >
              <i class="bi bi-eye" /> Preview
            </button>
          </div>
          <textarea
            v-if="editTab === 'edit'"
            v-model="editContent"
            class="attr-content-textarea"
            placeholder="Describe this attribute in markdown..."
            rows="8"
          />
          <div v-else class="attr-preview" v-html="renderedPreview" />
          <div class="attr-edit-actions">
            <button class="btn-small" @click="saveEdit">
              <i class="bi bi-check-lg" /> Save
            </button>
            <button class="btn-small secondary" @click="saveVersion">
              <i class="bi bi-bookmark-plus" /> Save Version
            </button>
            <button class="btn-small secondary" @click="cancelEdit">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Versions Dialog -->
    <dialog :open="versionsAttr !== null">
      <article>
        <header>
          <h3>Version History - {{ versionsAttr?.title }}</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="versionsAttr = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <section>
          <div v-if="versionsLoading" class="loading-indicator" />
          <template v-else>
            <div v-if="selectedVersion" class="version-view">
              <button class="secondary" @click="selectedVersion = null">
                <i class="bi bi-arrow-left" /> Back to list
              </button>
              <h4>
                {{ selectedVersion.title }} (v{{ selectedVersion.version }})
              </h4>
              <div class="version-content" v-html="renderedVersionContent" />
            </div>
            <template v-else>
              <table v-if="versions.length > 0">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="v in versions" :key="v.version">
                    <td>v{{ v.version }}</td>
                    <td>{{ v.title }}</td>
                    <td>{{ formatDate(v.dateCreated) }}</td>
                    <td>
                      <button class="small" @click="viewVersion(v)">
                        <i class="bi bi-eye" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="empty-hint">No versions saved yet.</p>
            </template>
          </template>
        </section>
      </article>
    </dialog>

    <!-- Delete Confirmation -->
    <dialog :open="deleteTarget !== null">
      <article>
        <header>
          <h3>Delete Attribute</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="deleteTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>Are you sure you want to delete "{{ deleteTarget?.title }}"?</p>
        <footer class="dialog-footer">
          <button class="secondary" @click="deleteTarget = null">Cancel</button>
          <button class="contrast" @click="deleteAttribute">Delete</button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
import { marked } from "marked";

const props = defineProps({
  bookId: { type: String, required: true },
});

const attrStore = useBookAttributesStore();

const loading = ref(false);
const editingId = ref(null);
const editTitle = ref("");
const editContent = ref("");
const editTab = ref("edit");

const versionsAttr = ref(null);
const versionsLoading = ref(false);
const versions = ref([]);
const selectedVersion = ref(null);
const deleteTarget = ref(null);

const attributes = computed(() => attrStore.attributes);

const renderedPreview = computed(() => {
  if (!editContent.value) return "<p class='empty-hint'>No content.</p>";
  return marked(editContent.value, { breaks: true });
});

const renderedVersionContent = computed(() => {
  if (!selectedVersion.value?.content) return "";
  return marked(selectedVersion.value.content, { breaks: true });
});

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

function startEdit(attr) {
  editingId.value = attr.id;
  editTitle.value = attr.title;
  editContent.value = attr.content;
  editTab.value = "edit";
}

function cancelEdit() {
  editingId.value = null;
  editTitle.value = "";
  editContent.value = "";
}

async function addAttribute() {
  try {
    const attr = await attrStore.create(props.bookId, "New Attribute", "");
    startEdit(attr);
  } catch {
    // silent
  }
}

async function saveEdit() {
  if (!editingId.value) return;
  try {
    await attrStore.update(editingId.value, {
      title: editTitle.value,
      content: editContent.value,
    });
    editingId.value = null;
  } catch {
    // silent
  }
}

async function saveVersion() {
  if (!editingId.value) return;
  // Save current content first, then create version
  try {
    await attrStore.update(editingId.value, {
      title: editTitle.value,
      content: editContent.value,
    });
    await attrStore.createVersion(editingId.value);
  } catch {
    // silent
  }
}

function confirmDelete(attr) {
  deleteTarget.value = attr;
}

async function deleteAttribute() {
  if (!deleteTarget.value) return;
  try {
    await attrStore.remove(deleteTarget.value.id);
    if (editingId.value === deleteTarget.value.id) cancelEdit();
    deleteTarget.value = null;
  } catch {
    // silent
  }
}

async function openVersions(attr) {
  versionsAttr.value = attr;
  versionsLoading.value = true;
  selectedVersion.value = null;
  try {
    versions.value = await attrStore.fetchVersions(attr.id);
  } catch {
    versions.value = [];
  } finally {
    versionsLoading.value = false;
  }
}

async function viewVersion(v) {
  try {
    selectedVersion.value = await attrStore.fetchVersion(
      versionsAttr.value.id,
      v.version,
    );
  } catch {
    selectedVersion.value = v;
  }
}

// Load attributes when bookId changes
watch(
  () => props.bookId,
  async (bookId) => {
    if (bookId) {
      loading.value = true;
      try {
        await attrStore.fetchByBook(bookId);
      } catch {
        // silent
      } finally {
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.attributes-editor {
  font-size: var(--text-md);
}

.attr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.attr-header h3 {
  margin: 0;
  font-size: var(--text-default);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.btn-small {
  padding: 0.2em 0.5em;
  font-size: var(--text-sm);
  background: none;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
}

.btn-small:hover {
  background: var(--pico-primary-background, #1095c1);
  color: var(--pico-primary-inverse, #fff);
}

.attr-card {
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: var(--space-xs);
  overflow: hidden;
}

.attr-collapsed {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.attr-collapsed:hover {
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.05));
}

.attr-title {
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attr-meta {
  font-size: var(--text-sm);
  opacity: 0.5;
}

.attr-actions {
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.attr-collapsed:hover .attr-actions {
  opacity: 1;
}

.attr-actions i {
  cursor: pointer;
  margin-left: var(--space-xs);
  font-size: var(--text-base);
}

.attr-edit {
  padding: var(--space-sm);
  display: grid;
  gap: var(--space-xs);
}

.attr-title-input {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  margin: 0;
  padding: var(--space-xs);
}

.attr-tabs {
  display: flex;
  gap: var(--space-xs);
}

.attr-tabs button {
  background: none;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  padding: var(--space-2xs) var(--space-sm);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.attr-tabs button.active {
  border-bottom-color: var(--pico-primary);
  color: var(--pico-primary);
}

.attr-content-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  font-family: var(--font-mono, monospace);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed, 1.6);
  background: transparent;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-sm);
}

.attr-preview {
  min-height: 120px;
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  overflow-y: auto;
  max-height: 400px;
}

.attr-edit-actions {
  display: flex;
  gap: var(--space-xs);
  justify-content: flex-end;
}

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-sm);
  font-size: var(--text-sm);
}

.version-view {
  display: grid;
  gap: var(--space-sm);
}

.version-content {
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  overflow-y: auto;
  max-height: 60vh;
}

button.small {
  padding: 0.2em 0.5em;
  font-size: var(--text-base);
}

/* Mobile: always show actions (no hover on touch) */
@media (max-width: 768px) {
  .attr-actions {
    opacity: 1;
  }

  .attr-collapsed {
    grid-template-columns: 1fr auto;
  }

  .attr-meta {
    display: none;
  }

  .attr-edit-actions {
    flex-wrap: wrap;
  }

  .attr-header h3 {
    font-size: var(--text-sm);
  }
}
</style>
