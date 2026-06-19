<template>
  <dialog :open="open">
    <article>
      <header>
        <h3>Version History</h3>
        <button class="close-btn" aria-label="Close" @click="$emit('close')">
          <i class="bi bi-x-lg" />
        </button>
      </header>
      <section>
        <div v-if="loading" class="loading-indicator" />
        <template v-else>
          <div v-if="selectedVersion" class="version-view">
            <header class="version-header">
              <button class="secondary" @click="selectedVersion = null">
                <i class="bi bi-arrow-left" /> Back to list
              </button>
              <span>Version {{ selectedVersion.version }}</span>
              <span class="version-date">
                {{ formatDate(selectedVersion.dateCreated) }}
              </span>
            </header>
            <h4>{{ selectedVersion.title }}</h4>
            <div class="version-content" v-html="renderedContent" />
          </div>
          <template v-else>
            <table v-if="versions.length > 0">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in versions" :key="v.version">
                  <td>v{{ v.version }}</td>
                  <td>{{ v.title }}</td>
                  <td>{{ formatDate(v.dateCreated) }}</td>
                  <td>
                    <button class="small" @click="viewVersion(v)">
                      <i class="bi bi-eye" /> View
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
</template>

<script setup>
import { marked } from "marked";

const props = defineProps({
  open: { type: Boolean, default: false },
  sectionId: { type: String, default: null },
});

defineEmits(["close"]);

const sectionsStore = useSectionsStore();

const loading = ref(false);
const versions = ref([]);
const selectedVersion = ref(null);

const renderedContent = computed(() => {
  if (!selectedVersion.value?.content) return "";
  return marked(selectedVersion.value.content, { breaks: true });
});

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

watch(
  () => props.open,
  async (val) => {
    if (val && props.sectionId) {
      loading.value = true;
      selectedVersion.value = null;
      try {
        versions.value = await sectionsStore.fetchVersions(props.sectionId);
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
    selectedVersion.value = await sectionsStore.fetchVersion(
      props.sectionId,
      v.version,
    );
  } catch {
    selectedVersion.value = v;
  }
}
</script>

<style scoped>
.version-view {
  display: grid;
  gap: var(--space-sm);
}

.version-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  justify-content: space-between;
}

.version-date {
  font-size: var(--text-sm);
  opacity: 0.6;
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

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-md);
}
</style>
