<template>
  <dialog :open="open">
    <article>
      <header>
        <h3>Book Version History</h3>
        <button
          v-if="viewingVersion"
          class="close-btn"
          aria-label="Close"
          @click="closeVersionView"
        >
          <i class="bi bi-x-lg" />
        </button>
        <button
          v-else
          class="close-btn"
          aria-label="Close"
          @click="$emit('close')"
        >
          <i class="bi bi-x-lg" />
        </button>
      </header>
      <section>
        <!-- Loading state -->
        <div v-if="loading" class="loading-indicator" />

        <!-- Version detail view -->
        <template v-else-if="viewingVersion">
          <header class="version-detail-header">
            <button class="secondary" @click="viewingVersion = null">
              <i class="bi bi-arrow-left" /> Back to list
            </button>
            <span class="version-badge">v{{ viewingVersion.versionNumber }}</span>
          </header>

          <div class="version-meta">
            <p v-if="viewingVersion.note" class="version-note">
              <strong>Note:</strong> {{ viewingVersion.note }}
            </p>
            <p class="version-date">
              {{ formatDate(viewingVersion.dateCreated) }}
            </p>
          </div>

          <div class="version-info">
            <p><strong>Sections:</strong> {{ parsedSnapshot?.sections?.length || 0 }}</p>
            <p><strong>Attributes:</strong> {{ parsedSnapshot?.attributes?.length || 0 }}</p>
            <p><strong>Media items:</strong> {{ parsedSnapshot?.mediaMeta?.length || 0 }}</p>
          </div>

          <footer class="version-detail-footer">
            <button class="secondary" @click="loadVersionSections">
              <i class="bi bi-eye" /> View this version
            </button>
            <button class="contrast" @click="confirmRestore">
              <i class="bi bi-arrow-counterclockwise" /> Restore this version
            </button>
          </footer>
        </template>

        <!-- Version list -->
        <template v-else>
          <div v-if="versions.length > 0" class="version-list">
            <div
              v-for="v in versions"
              :key="v.id"
              class="version-item"
              @click="viewVersion(v)"
            >
              <div class="version-item-header">
                <span class="version-badge">v{{ v.versionNumber }}</span>
                <span class="version-date">{{ formatDate(v.dateCreated) }}</span>
              </div>
              <p v-if="v.note" class="version-item-note">{{ v.note }}</p>
            </div>
          </div>
          <p v-else class="empty-hint">No versions saved yet.</p>
        </template>
      </section>

      <!-- Restore Confirmation -->
      <dialog :open="showRestoreConfirm" class="nested-dialog">
        <article>
          <header>
            <h3>Restore Version</h3>
            <button
              class="close-btn"
              aria-label="Close"
              @click="showRestoreConfirm = false"
            >
              <i class="bi bi-x-lg" />
            </button>
          </header>
          <p>
            Are you sure you want to restore version
            <strong>v{{ viewingVersion?.versionNumber }}</strong>? This will
            replace all current sections, attributes, and media with the data
            from this version. This action cannot be undone.
          </p>
          <footer class="dialog-footer">
            <button
              class="secondary"
              :disabled="restoring"
              @click="showRestoreConfirm = false"
            >
              Cancel
            </button>
            <button
              class="contrast"
              :aria-busy="restoring"
              :disabled="restoring"
              @click="restoreVersion"
            >
              Restore
            </button>
          </footer>
        </article>
      </dialog>
    </article>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useBooksStore } from "../stores/books";
import { useSectionsStore } from "../stores/sections";

const props = defineProps({
  open: { type: Boolean, default: false },
  bookId: { type: String, default: null },
});

const emit = defineEmits(["close", "load-version", "close-version", "restored"]);

const booksStore = useBooksStore();
const sectionsStore = useSectionsStore();

const loading = ref(false);
const versions = ref([]);
const viewingVersion = ref(null);
const parsedSnapshot = ref(null);
const showRestoreConfirm = ref(false);
const restoring = ref(false);

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

watch(
  () => props.open,
  async (val) => {
    if (val && props.bookId) {
      loading.value = true;
      viewingVersion.value = null;
      parsedSnapshot.value = null;
      try {
        versions.value = await booksStore.fetchVersions(props.bookId);
      } catch {
        versions.value = [];
      } finally {
        loading.value = false;
      }
    }
  },
);

async function viewVersion(v) {
  try {
    const fullVersion = await booksStore.fetchVersion(props.bookId, v.id);
    viewingVersion.value = fullVersion;
    try {
      parsedSnapshot.value = JSON.parse(fullVersion.snapshot || "{}");
    } catch {
      parsedSnapshot.value = null;
    }
  } catch {
    viewingVersion.value = v;
    try {
      parsedSnapshot.value = JSON.parse(v.snapshot || "{}");
    } catch {
      parsedSnapshot.value = null;
    }
  }
}

function closeVersionView() {
  viewingVersion.value = null;
  parsedSnapshot.value = null;
  emit("close-version");
}

function loadVersionSections() {
  if (!parsedSnapshot.value) return;
  // Replace sections store with version snapshot sections
  sectionsStore.sections = parsedSnapshot.value.sections || [];
  emit("load-version", viewingVersion.value.id);
}

function confirmRestore() {
  showRestoreConfirm.value = true;
}

async function restoreVersion() {
  if (!viewingVersion.value || !props.bookId) return;
  restoring.value = true;
  try {
    await booksStore.restoreVersion(props.bookId, viewingVersion.value.id);
    showRestoreConfirm.value = false;
    emit("restored");
    emit("close");
  } catch (e) {
    alert(e.response?.data?.error || "Failed to restore version");
  } finally {
    restoring.value = false;
  }
}
</script>

<style scoped>
.version-list {
  display: grid;
  gap: var(--space-sm);
}

.version-item {
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.version-item:hover {
  border-color: var(--pico-primary);
}

.version-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.version-badge {
  font-weight: var(--weight-bold);
  color: var(--pico-primary);
  font-size: var(--text-lg);
}

.version-date {
  font-size: var(--text-sm);
  opacity: 0.6;
}

.version-item-note {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-sm);
  opacity: 0.8;
}

.version-detail-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.version-meta {
  margin-bottom: var(--space-md);
}

.version-note {
  font-size: var(--text-md);
  margin-bottom: var(--space-xs);
}

.version-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: var(--space-md);
}

.version-info p {
  margin: 0;
  font-size: var(--text-sm);
}

.version-detail-footer {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-md);
}

.dialog-footer {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

/* Nested dialog styling */
.nested-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
}

@media (max-width: 768px) {
  .version-info {
    grid-template-columns: 1fr;
  }

  .version-detail-footer {
    flex-direction: column;
  }
}
</style>
