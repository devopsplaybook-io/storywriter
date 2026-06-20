<template>
  <div class="section-reorder">
    <div class="reorder-header">
      <i class="bi bi-folder" />
      <span>Sub-sections</span>
      <span class="child-count">{{ children.length }}</span>
    </div>

    <div v-if="children.length === 0" class="empty-children">
      <p>No child sections yet.</p>
      <p class="hint">Use the sidebar to add child sections.</p>
    </div>

    <ul v-else class="reorder-list">
      <li
        v-for="(child, index) in children"
        :key="child.id"
        class="reorder-item"
        :class="{
          'drag-over': dragOverId === child.id,
          dragging: dragSourceId === child.id,
        }"
        draggable="true"
        @dragstart="onDragStart($event, child, index)"
        @dragover.prevent="onDragOver(child)"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop(child, index)"
        @dragend="onDragEnd"
      >
        <span class="drag-handle">
          <i class="bi bi-grip-vertical" />
        </span>
        <i :class="getChildIcon(child)" class="child-icon" />
        <span class="child-title">{{ child.title || "Untitled" }}</span>
        <span class="child-type">{{ child.type }}</span>
        <span class="reorder-actions">
          <button
            class="btn-sm"
            :disabled="index === 0"
            title="Move up"
            @click="moveUp(index)"
          >
            <i class="bi bi-chevron-up" />
          </button>
          <button
            class="btn-sm"
            :disabled="index === children.length - 1"
            title="Move down"
            @click="moveDown(index)"
          >
            <i class="bi bi-chevron-down" />
          </button>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
const props = defineProps({
  children: { type: Array, required: true },
  getChildren: { type: Function, required: true },
});

const emit = defineEmits(["reorder"]);

const dragSourceId = ref(null);
const dragSourceIndex = ref(null);
const dragOverId = ref(null);

function getChildIcon(child) {
  switch (child.type) {
    case "container":
      return "bi bi-folder";
    case "media":
      return "bi bi-image";
    default:
      return "bi bi-file-text";
  }
}

function onDragStart(event, child, index) {
  dragSourceId.value = child.id;
  dragSourceIndex.value = index;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", child.id);
}

function onDragOver(child) {
  if (child.id === dragSourceId.value) return;
  dragOverId.value = child.id;
}

function onDragLeave() {
  dragOverId.value = null;
}

function onDrop(targetChild, targetIndex) {
  if (dragSourceId.value === targetChild.id) return;
  emit("reorder", {
    sourceIndex: dragSourceIndex.value,
    targetIndex,
  });
  dragOverId.value = null;
}

function onDragEnd() {
  dragSourceId.value = null;
  dragSourceIndex.value = null;
  dragOverId.value = null;
}

function moveUp(index) {
  if (index <= 0) return;
  emit("reorder", { sourceIndex: index, targetIndex: index - 1 });
}

function moveDown(index) {
  if (index >= props.children.length - 1) return;
  emit("reorder", { sourceIndex: index, targetIndex: index + 1 });
}
</script>

<style scoped>
.section-reorder {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex: 1;
  min-height: 0;
}

.reorder-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  color: var(--pico-muted-color);
}

.child-count {
  font-size: var(--text-sm);
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.05));
}

.empty-children {
  display: grid;
  place-items: center;
  padding: var(--space-xl);
  text-align: center;
  color: var(--pico-muted-color);
  border: 1px dashed var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  flex: 1;
}

.empty-children .hint {
  font-size: var(--text-sm);
  opacity: 0.7;
}

.reorder-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.reorder-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  cursor: grab;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    opacity var(--transition-fast);
}

.reorder-item:hover {
  border-color: var(--pico-primary);
}

.reorder-item.dragging {
  opacity: 0.4;
}

.reorder-item.drag-over {
  border-color: var(--pico-primary);
  border-style: dashed;
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.1));
}

.drag-handle {
  cursor: grab;
  color: var(--pico-muted-color);
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
}

.child-icon {
  color: var(--pico-muted-color);
}

.child-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-md);
}

.child-type {
  font-size: var(--text-2xs, 0.7rem);
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.05));
  color: var(--pico-muted-color);
  white-space: nowrap;
}

.reorder-actions {
  display: flex;
  gap: var(--space-2xs);
}

.btn-sm {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  padding: var(--space-2xs);
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  display: flex;
  align-items: center;
  line-height: 1;
}

.btn-sm:hover:not(:disabled) {
  border-color: var(--pico-muted-border-color, #444);
  color: var(--pico-primary);
}

.btn-sm:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
