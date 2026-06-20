<template>
  <div class="section-tree">
    <div v-if="rootSection" class="tree-node">
      <div
        class="tree-item"
        :class="{ selected: selectedId === rootSection.id }"
        @click="$emit('select', rootSection.id)"
      >
        <i class="bi bi-book" />
        <span class="tree-label">{{ rootSection.title || "Book Root" }}</span>
        <span class="tree-actions">
          <span v-if="rootSection.type === 'container'" class="add-child-wrap">
            <i
              class="bi bi-plus-lg"
              title="Add child section"
              @click.stop="showTypePicker = !showTypePicker"
            />
            <div v-if="showTypePicker" class="type-picker-popover">
              <button @click.stop="pickType('text')">
                <i class="bi bi-file-text" /> Text
              </button>
              <button @click.stop="pickType('container')">
                <i class="bi bi-folder" /> Container
              </button>
              <button @click.stop="pickType('media')">
                <i class="bi bi-image" /> Media
              </button>
            </div>
          </span>
        </span>
      </div>
      <div class="tree-children">
        <SectionTreeNode
          v-for="child in getChildren(rootSection.id)"
          :key="child.id"
          :section="child"
          :selected-id="selectedId"
          :get-children="getChildren"
          :depth="1"
          @select="(id) => $emit('select', id)"
          @add-child="(id, type) => $emit('add-child', id, type)"
          @move="
            (id, parentId, orderIndex) =>
              $emit('move', id, parentId, orderIndex)
          "
          @delete="(id) => $emit('delete', id)"
        />
      </div>
    </div>
    <p v-else class="empty-hint">No sections yet.</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  rootSection: { type: Object, default: null },
  selectedId: { type: String, default: null },
  getChildren: { type: Function, required: true },
});

const emit = defineEmits(["select", "add-child", "move", "delete"]);

const showTypePicker = ref(false);

function pickType(type) {
  showTypePicker.value = false;
  if (props.rootSection) {
    emit("add-child", props.rootSection.id, type);
  }
}

function closePicker() {
  if (showTypePicker.value) showTypePicker.value = false;
}
onMounted(() => document.addEventListener("click", closePicker));
onBeforeUnmount(() => document.removeEventListener("click", closePicker));
</script>

<style scoped>
.section-tree {
  font-size: var(--text-md);
}

.tree-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.tree-item:hover {
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.05));
}

.tree-item.selected {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
  color: var(--pico-primary);
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-child-wrap {
  position: relative;
  display: inline-block;
}

.type-picker-popover {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 100;
  min-width: 130px;
  background: var(--pico-card-background-color, #1a1a2e);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: var(--space-2xs) 0;
}

.type-picker-popover button {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-2xs) var(--space-sm);
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: var(--text-sm);
  text-align: left;
}

.type-picker-popover button:hover {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
}

.tree-actions {
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.tree-item:hover .tree-actions {
  opacity: 1;
}

.tree-actions i {
  cursor: pointer;
  font-size: var(--text-base);
  padding: 0 var(--space-2xs);
}

.tree-children {
  padding-left: var(--space-md);
}

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-md);
}

/* Mobile: always show tree actions (no hover on touch) */
@media (max-width: 768px) {
  .tree-actions {
    opacity: 1;
  }
}
</style>
