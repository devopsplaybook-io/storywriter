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
          <i
            class="bi bi-plus-lg"
            title="Add child section"
            @click.stop="$emit('add-child', rootSection.id)"
          />
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
          @add-child="(id) => $emit('add-child', id)"
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
defineProps({
  rootSection: { type: Object, default: null },
  selectedId: { type: String, default: null },
  getChildren: { type: Function, required: true },
});

defineEmits(["select", "add-child", "move", "delete"]);
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
