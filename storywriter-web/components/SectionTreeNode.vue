<template>
  <div
    class="tree-node"
    :style="{ paddingLeft: depth > 1 ? 'var(--space-sm)' : '0' }"
  >
    <div
      class="tree-item"
      :class="{ selected: selectedId === section.id }"
      @click="$emit('select', section.id)"
    >
      <i :class="sectionIcon" />
      <span class="tree-label">{{ section.title || "Untitled" }}</span>
      <span v-if="sectionTypeBadge" class="tree-type-badge">
        {{ sectionTypeBadge }}
      </span>
      <span class="tree-actions">
        <i
          class="bi bi-plus-lg"
          title="Add child section"
          @click.stop="$emit('add-child', section.id)"
        />
        <i
          class="bi bi-trash"
          title="Delete section"
          @click.stop="$emit('delete', section.id)"
        />
      </span>
    </div>
    <div v-if="hasChildren" class="tree-children">
      <SectionTreeNode
        v-for="child in children"
        :key="child.id"
        :section="child"
        :selected-id="selectedId"
        :get-children="getChildren"
        :depth="depth + 1"
        @select="(id) => $emit('select', id)"
        @add-child="(id) => $emit('add-child', id)"
        @move="
          (id, parentId, orderIndex) => $emit('move', id, parentId, orderIndex)
        "
        @delete="(id) => $emit('delete', id)"
      />
    </div>
  </div>
</template>

<script setup>
import { usePropertiesStore } from "../stores/properties";

const props = defineProps({
  section: { type: Object, required: true },
  selectedId: { type: String, default: null },
  getChildren: { type: Function, required: true },
  depth: { type: Number, default: 1 },
});

defineEmits(["select", "add-child", "move", "delete"]);

const propertiesStore = usePropertiesStore();

const children = computed(() => props.getChildren(props.section.id));
const hasChildren = computed(() => children.value.length > 0);

const sectionIcon = computed(() => {
  const type = props.section.type || "text";
  switch (type) {
    case "container":
      return "bi bi-folder";
    case "media":
      return "bi bi-image";
    default:
      return hasChildren.value ? "bi bi-folder" : "bi bi-file-text";
  }
});

const sectionTypeBadge = computed(() => {
  const types = propertiesStore.getSectionTypes(props.section.id);
  return types.length > 0 ? types[0] : null;
});
</script>

<style scoped>
.tree-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
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

.tree-type-badge {
  font-size: var(--text-2xs, 0.7rem);
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-sm, 4px);
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
  border: 1px solid var(--pico-primary, #1095c1);
  color: var(--pico-primary);
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

/* Mobile: always show tree actions (no hover on touch) */
@media (max-width: 768px) {
  .tree-actions {
    opacity: 1;
  }
}
</style>
