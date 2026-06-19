<template>
  <div class="property-editor">
    <header class="prop-header">
      <h4>Section Types</h4>
      <button
        v-if="!sectionTypeProp"
        class="btn-small"
        @click="createDefaultProperty"
      >
        <i class="bi bi-plus-lg" /> Add
      </button>
    </header>

    <!-- Section type management -->
    <div v-if="sectionTypeProp" class="section-type-manager">
      <!-- Property name (editable) -->
      <div class="prop-name-row">
        <input
          v-model="propertyName"
          type="text"
          class="prop-name-input"
          placeholder="Property name"
          @blur="savePropertyName"
        />
      </div>

      <!-- Type chips -->
      <div class="type-chips">
        <span
          v-for="opt in sectionTypeProp.options"
          :key="opt"
          class="type-chip"
        >
          {{ opt }}
          <i class="bi bi-x-lg" title="Remove type" @click="removeType(opt)" />
        </span>
        <span v-if="!sectionTypeProp.options.length" class="empty-hint">
          No section types defined yet.
        </span>
      </div>

      <!-- Add new type -->
      <div class="add-type-row">
        <input
          v-model="newTypeName"
          type="text"
          class="type-input"
          placeholder="New section type name..."
          @keydown.enter="addType"
        />
        <button
          class="btn-small"
          :disabled="!newTypeName.trim()"
          @click="addType"
        >
          <i class="bi bi-plus-lg" /> Add Type
        </button>
      </div>

      <!-- Delete property -->
      <div class="delete-prop-row">
        <button class="btn-small danger" @click="deleteProperty">
          <i class="bi bi-trash" /> Delete Section Types Property
        </button>
      </div>
    </div>

    <!-- No property yet -->
    <p v-else class="empty-hint">
      No section types property defined for this book.
    </p>
  </div>
</template>

<script setup>
const props = defineProps({
  bookId: { type: String, default: null },
});

const propertiesStore = usePropertiesStore();

const sectionTypeProp = computed(() => propertiesStore.sectionTypeProperty);
const newTypeName = ref("");
const propertyName = ref("");

// Sync property name when it loads
watch(
  sectionTypeProp,
  (prop) => {
    if (prop) {
      propertyName.value = prop.name;
    }
  },
  { immediate: true },
);

async function createDefaultProperty() {
  if (!props.bookId) return;
  await propertiesStore.create(props.bookId, "Section Types", ["Chapter"]);
}

async function savePropertyName() {
  if (!sectionTypeProp.value) return;
  if (propertyName.value === sectionTypeProp.value.name) return;
  await propertiesStore.update(sectionTypeProp.value.id, {
    name: propertyName.value,
  });
}

async function addType() {
  const name = newTypeName.value.trim();
  if (!name || !sectionTypeProp.value) return;
  // Avoid duplicates
  if (sectionTypeProp.value.options.includes(name)) {
    newTypeName.value = "";
    return;
  }
  const newOptions = [...sectionTypeProp.value.options, name];
  await propertiesStore.update(sectionTypeProp.value.id, {
    options: newOptions,
  });
  newTypeName.value = "";
}

async function removeType(typeName) {
  if (!sectionTypeProp.value) return;
  const newOptions = sectionTypeProp.value.options.filter(
    (o) => o !== typeName,
  );
  await propertiesStore.update(sectionTypeProp.value.id, {
    options: newOptions,
  });
}

async function deleteProperty() {
  if (!sectionTypeProp.value) return;
  if (
    !confirm(
      "Delete the Section Types property? This will remove all section type assignments.",
    )
  )
    return;
  await propertiesStore.remove(sectionTypeProp.value.id);
}

// Load properties when bookId changes
watch(
  () => props.bookId,
  async (bookId) => {
    if (bookId) await propertiesStore.fetchByBook(bookId);
  },
  { immediate: true },
);
</script>

<style scoped>
.property-editor {
  font-size: var(--text-md);
}

.prop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.prop-header h4 {
  margin: 0;
  font-size: var(--text-lg);
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

.btn-small.danger {
  color: var(--pico-del-color, #e05656);
  border-color: var(--pico-del-color, #e05656);
}

.btn-small.danger:hover {
  background: var(--pico-del-color, #e05656);
  color: #fff;
}

.btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-type-manager {
  display: grid;
  gap: var(--space-md);
}

.prop-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.prop-name-input {
  margin: 0;
  padding: var(--space-xs);
  font-size: var(--text-md);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  flex: 1;
}

.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.type-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-2xs) var(--space-xs);
  background: var(--pico-primary-background, rgba(16, 149, 193, 0.15));
  border: 1px solid var(--pico-primary, #1095c1);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--text-sm);
  color: var(--pico-primary);
}

.type-chip i {
  cursor: pointer;
  font-size: 0.7em;
  opacity: 0.7;
}

.type-chip i:hover {
  opacity: 1;
}

.add-type-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.type-input {
  margin: 0;
  padding: var(--space-xs);
  font-size: var(--text-md);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  flex: 1;
}

.delete-prop-row {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--pico-muted-border-color, #333);
}

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-sm);
  font-size: var(--text-sm);
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .add-type-row {
    flex-direction: column;
    align-items: stretch;
  }

  .add-type-row .btn-small {
    justify-content: center;
  }
}
</style>
