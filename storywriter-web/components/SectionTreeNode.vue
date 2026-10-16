<template>
  <div
    class="tree-node"
    :style="{ paddingLeft: depth > 1 ? 'var(--space-sm)' : '0' }"
  >
    <div
      class="tree-item"
      :class="{
        selected: selectedId === section.id,
        dragging: isDragSource,
        'drag-over-into': dropMode === 'into',
        'drag-over-before': dropMode === 'before',
        'drag-over-after': dropMode === 'after',
        'menu-open': showMenu,
      }"
      draggable="true"
      @click="$emit('select', section.id)"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="clearDrop"
      @drop.prevent="onDrop"
      @dragend="onDragEnd"
      @contextmenu.prevent="showMenu = true"
    >
      <i :class="sectionIcon" />
      <span class="tree-label">{{ section.title || "Untitled" }}</span>
      <span class="tree-actions">
        <span v-if="section.type === 'container'" class="add-child-wrap">
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
        <span class="menu-wrap">
          <i
            class="bi bi-three-dots"
            title="Section menu"
            @click.stop="showMenu = !showMenu"
          />
          <div v-if="showMenu" class="tree-menu-popover">
            <button @click.stop="menuAction('rename')">
              <i class="bi bi-pencil" /> Rename
            </button>
            <button @click.stop="menuAction('duplicate')">
              <i class="bi bi-copy" /> Duplicate
            </button>
            <button @click.stop="menuAction('move-to')">
              <i class="bi bi-arrow-right-circle" /> Move to…
            </button>
            <button @click.stop="menuAction('delete')">
              <i class="bi bi-trash" /> Delete
            </button>
          </div>
        </span>
        <i
          class="bi bi-trash"
          title="Delete section"
          @click.stop="$emit('delete', section.id)"
        />
      </span>
      <span class="tree-type-label">{{ sectionTypeLabel }}</span>
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
        @add-child="(id, type) => $emit('add-child', id, type)"
        @move="
          (id, parentId, orderIndex) => $emit('move', id, parentId, orderIndex)
        "
        @reorder="
          (id, parentId, orderIndex) =>
            $emit('reorder', id, parentId, orderIndex)
        "
        @rename="(id) => $emit('rename', id)"
        @duplicate="(id) => $emit('duplicate', id)"
        @move-to="(id) => $emit('move-to', id)"
        @delete="(id) => $emit('delete', id)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref, onMounted, onBeforeUnmount } from "vue";
import { usePropertiesStore } from "../stores/properties";
import { buildReorderedSiblings, computeDropMode } from "../utils/sectionTree";

const props = defineProps({
  section: { type: Object, required: true },
  selectedId: { type: String, default: null },
  getChildren: { type: Function, required: true },
  depth: { type: Number, default: 1 },
});

const emit = defineEmits([
  "select",
  "add-child",
  "move",
  "reorder",
  "rename",
  "duplicate",
  "move-to",
  "delete",
]);

const propertiesStore = usePropertiesStore();

// Shared drag context provided by SectionTree so every node can guard drops
const treeDrag = inject("treeDrag", ref(null));

const showTypePicker = ref(false);
const showMenu = ref(false);
const dropMode = ref(null);

const children = computed(() => props.getChildren(props.section.id));
const hasChildren = computed(() => children.value.length > 0);

const isDragSource = computed(() => treeDrag.value?.id === props.section.id);

function collectSubtreeIds(id) {
  const ids = [id];
  for (const child of props.getChildren(id)) {
    ids.push(...collectSubtreeIds(child.id));
  }
  return ids;
}

function onDragStart(event) {
  treeDrag.value = {
    id: props.section.id,
    subtreeIds: collectSubtreeIds(props.section.id),
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", props.section.id);
}

function onDragOver(event) {
  const drag = treeDrag.value;
  if (!drag || drag.subtreeIds.includes(props.section.id)) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratioY = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
  dropMode.value = computeDropMode(ratioY, props.section.type === "container");
  event.preventDefault();
}

function clearDrop() {
  dropMode.value = null;
}

function onDrop(event) {
  event.preventDefault();
  const drag = treeDrag.value;
  const mode = dropMode.value;
  clearDrop();
  if (!drag || !mode || drag.subtreeIds.includes(props.section.id)) return;
  if (mode === "into") {
    emit("move", drag.id, props.section.id, children.value.length);
    return;
  }
  const siblings = props.section.parentId
    ? props.getChildren(props.section.parentId)
    : [];
  const reordered = buildReorderedSiblings(
    siblings,
    drag.id,
    props.section.id,
    mode,
  );
  let orderIndex;
  if (reordered) {
    orderIndex = reordered.findIndex((s) => s.id === drag.id);
  } else {
    // Cross-parent drop: the dragged section is not part of this sibling list
    const targetIndex = siblings.findIndex((s) => s.id === props.section.id);
    if (targetIndex < 0) return;
    orderIndex = mode === "before" ? targetIndex : targetIndex + 1;
  }
  emit("reorder", drag.id, props.section.parentId, orderIndex);
}

function onDragEnd() {
  treeDrag.value = null;
  clearDrop();
}

function menuAction(action) {
  showMenu.value = false;
  emit(action, props.section.id);
}

function pickType(type) {
  showTypePicker.value = false;
  emit("add-child", props.section.id, type);
}

function closePopovers() {
  if (showTypePicker.value) showTypePicker.value = false;
  if (showMenu.value) showMenu.value = false;
}
onMounted(() => document.addEventListener("click", closePopovers));
onBeforeUnmount(() => document.removeEventListener("click", closePopovers));

const sectionIcon = computed(() => {
  const type = props.section.type || "text";
  switch (type) {
    case "container":
      return "bi bi-folder";
    case "media":
      return "bi bi-image";
    default:
      return "bi bi-file-text";
  }
});

const sectionTypeLabel = computed(() => {
  const types = propertiesStore.getSectionTypes(props.section.id);
  if (types.length > 0) return types[0];
  // Fallback to structural type
  const type = props.section.type || "text";
  switch (type) {
    case "container":
      return "folder";
    case "media":
      return "media";
    default:
      return "text";
  }
});
</script>

<style scoped>
.tree-item {
  position: relative;
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

.tree-item.dragging {
  opacity: 0.4;
}

.tree-item.drag-over-into {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.3));
  outline: 1px dashed var(--pico-primary, #1095c1);
}

.tree-item.drag-over-before::before,
.tree-item.drag-over-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--pico-primary, #1095c1);
  z-index: 1;
}

.tree-item.drag-over-before::before {
  top: 0;
}

.tree-item.drag-over-after::after {
  bottom: 0;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-type-label {
  font-size: 0.6rem;
  color: var(--pico-muted-color);
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 4.5em;
  text-align: right;
  justify-self: end;
}

.add-child-wrap,
.menu-wrap {
  position: relative;
  display: inline-block;
}

.type-picker-popover,
.tree-menu-popover {
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

.type-picker-popover button,
.tree-menu-popover button {
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

.type-picker-popover button:hover,
.tree-menu-popover button:hover {
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
}

.tree-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.tree-item:hover .tree-actions,
.tree-item.menu-open .tree-actions {
  opacity: 1;
}

.tree-actions i {
  cursor: pointer;
  font-size: var(--text-base);
  line-height: 1;
  padding: 0.3rem 0.35rem;
  border-radius: var(--radius-sm, 4px);
}

.tree-actions i:hover {
  background: var(--pico-secondary-background, rgba(128, 128, 128, 0.25));
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
