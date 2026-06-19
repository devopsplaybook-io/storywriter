<template>
  <div class="media-gallery">
    <div
      class="drop-zone"
      :class="{ 'drop-zone-active': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="$refs.fileInput.click()"
    >
      <i class="bi bi-cloud-arrow-up" />
      <p v-if="isDragging">Drop files here</p>
      <p v-else>Drag & drop images or click to upload</p>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        multiple
        hidden
        @change="handleFileSelect"
      />
    </div>

    <div v-if="uploading" class="upload-progress">
      <div class="loading-indicator" />
      <span>Uploading...</span>
    </div>

    <div v-if="error" class="error-message">
      <i class="bi bi-exclamation-circle" />
      {{ error }}
    </div>

    <div v-if="mediaList.length === 0 && !uploading" class="empty-state">
      <i class="bi bi-image" />
      <p>No media yet</p>
    </div>

    <div v-else class="media-grid">
      <div
        v-for="item in mediaList"
        :key="item.id"
        class="media-item"
        :class="{ selected: selectedId === item.id }"
        @click="$emit('select', item)"
        @contextmenu.prevent="openContextMenu($event, item)"
      >
        <img :src="getMediaUrl(item)" :alt="item.slug" loading="lazy" />
        <div class="media-info">
          <span class="media-slug">{{ item.slug }}</span>
          <span class="media-size">{{ formatSize(item.size) }}</span>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <button @click="editSlug"><i class="bi bi-pencil" /> Edit slug</button>
      <button @click="confirmDelete" class="danger">
        <i class="bi bi-trash" /> Delete
      </button>
    </div>

    <!-- Edit slug dialog -->
    <dialog :open="showSlugDialog">
      <article>
        <header>
          <h3>Edit Slug</h3>
          <button class="close-btn" @click="showSlugDialog = false">
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <input
          v-model="newSlug"
          type="text"
          placeholder="Enter slug"
          @keydown.enter="saveSlug"
        />
        <footer>
          <button @click="showSlugDialog = false">Cancel</button>
          <button @click="saveSlug">Save</button>
        </footer>
      </article>
    </dialog>

    <!-- Delete confirmation dialog -->
    <dialog :open="showDeleteDialog">
      <article>
        <header>
          <h3>Delete Media</h3>
          <button class="close-btn" @click="showDeleteDialog = false">
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>Are you sure you want to delete "{{ selectedItem?.slug }}"?</p>
        <footer>
          <button @click="showDeleteDialog = false">Cancel</button>
          <button class="danger" @click="deleteMedia">Delete</button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useMediaStore } from "../stores/media";

const props = defineProps({
  bookId: { type: String, required: true },
  selectedId: { type: String, default: null },
});

const emit = defineEmits(["select"]);

const mediaStore = useMediaStore();

const isDragging = ref(false);
const uploading = ref(false);
const error = ref(null);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
const selectedItem = ref(null);
const showSlugDialog = ref(false);
const showDeleteDialog = ref(false);
const newSlug = ref("");
const fileInput = ref(null);

const mediaList = computed(() => mediaStore.getMediaForBook(props.bookId));

onMounted(async () => {
  await mediaStore.fetchMedia(props.bookId);
  document.addEventListener("click", closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener("click", closeContextMenu);
});

function getMediaUrl(item) {
  return mediaStore.getMediaUrl(props.bookId, item.id);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function handleFileSelect(event) {
  const files = event.target.files;
  if (files.length > 0) {
    await uploadFiles(files);
  }
  event.target.value = "";
}

async function handleDrop(event) {
  isDragging.value = false;
  const files = event.dataTransfer.files;
  if (files.length > 0) {
    await uploadFiles(files);
  }
}

async function uploadFiles(files) {
  error.value = null;
  const validTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];

  for (const file of files) {
    if (!validTypes.includes(file.type)) {
      error.value = `Invalid file type: ${file.name}`;
      continue;
    }
    uploading.value = true;
    try {
      await mediaStore.uploadMedia(props.bookId, file);
    } catch (e) {
      error.value = e.response?.data?.error || "Upload failed";
    }
  }
  uploading.value = false;
}

function openContextMenu(event, item) {
  selectedItem.value = item;
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
  };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function editSlug() {
  closeContextMenu();
  newSlug.value = selectedItem.value.slug;
  showSlugDialog.value = true;
}

async function saveSlug() {
  if (!newSlug.value.trim()) return;
  try {
    await mediaStore.updateMediaSlug(
      props.bookId,
      selectedItem.value.id,
      newSlug.value.trim(),
    );
    showSlugDialog.value = false;
  } catch (e) {
    error.value = e.response?.data?.error || "Failed to update slug";
  }
}

function confirmDelete() {
  closeContextMenu();
  showDeleteDialog.value = true;
}

async function deleteMedia() {
  try {
    await mediaStore.deleteMedia(props.bookId, selectedItem.value.id);
    showDeleteDialog.value = false;
  } catch (e) {
    error.value = e.response?.data?.error || "Failed to delete media";
  }
}
</script>

<style scoped>
.media-gallery {
  display: grid;
  gap: var(--space-sm);
  height: 100%;
  overflow-y: auto;
}

.drop-zone {
  border: 2px dashed var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-md);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--pico-muted-color);
}

.drop-zone:hover,
.drop-zone-active {
  border-color: var(--pico-primary);
  background: var(--pico-primary-hover-background, rgba(0, 0, 0, 0.1));
  color: var(--pico-primary);
}

.drop-zone i {
  font-size: var(--text-icon, 2rem);
  display: block;
  margin-bottom: var(--space-xs);
}

.drop-zone p {
  margin: 0;
  font-size: var(--text-sm);
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  border-radius: var(--radius-sm, 4px);
}

.error-message {
  color: var(--pico-del-color, #ff6b6b);
  font-size: var(--text-sm);
  padding: var(--space-sm);
  background: rgba(255, 107, 107, 0.1);
  border-radius: var(--radius-sm, 4px);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.empty-state {
  display: grid;
  place-items: center;
  padding: var(--space-xl);
  color: var(--pico-muted-color);
  text-align: center;
}

.empty-state i {
  font-size: var(--text-icon, 3rem);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.media-item {
  border: 2px solid transparent;
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
  cursor: pointer;
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  transition: all var(--transition-fast);
}

.media-item:hover {
  border-color: var(--pico-muted-border-color, #444);
}

.media-item.selected {
  border-color: var(--pico-primary);
}

.media-item img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  display: block;
}

.media-info {
  padding: var(--space-xs);
  display: grid;
  gap: var(--space-2xs);
}

.media-slug {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-size {
  font-size: var(--text-xs);
  color: var(--pico-muted-color);
}

.context-menu {
  position: fixed;
  background: var(--pico-card-background-color, #222);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-xs);
  z-index: 1000;
  display: grid;
  gap: var(--space-2xs);
}

.context-menu button {
  background: none;
  border: none;
  padding: var(--space-xs) var(--space-sm);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm, 4px);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.context-menu button:hover {
  background: var(--pico-primary-hover-background, rgba(0, 0, 0, 0.1));
}

.context-menu button.danger {
  color: var(--pico-del-color, #ff6b6b);
}

dialog article {
  max-width: 400px;
}

dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

button.danger {
  background: var(--pico-del-color, #ff6b6b);
  color: white;
  border: none;
}
</style>
