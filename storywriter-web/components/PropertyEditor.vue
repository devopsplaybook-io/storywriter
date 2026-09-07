<template>
  <div class="property-editor">
    <header class="prop-header">
      <div>
        <h4><i class="bi bi-tags" /> Section Types</h4>
        <p class="prop-description">
          Define the types you can assign to sections of this book. Assigned
          types are displayed next to each section in the navigation tree.
        </p>
      </div>
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
      <!-- Type chips with usage counts -->
      <div class="type-chips">
        <span
          v-for="opt in sectionTypeProp.options"
          :key="opt"
          class="type-chip"
        >
          <span class="chip-name">{{ opt }}</span>
          <span class="chip-count" :title="`${typeUsage(opt)} section(s) assigned`">
            {{ typeUsage(opt) }}
          </span>
          <i
            class="bi bi-x-lg"
            title="Remove type"
            @click="removeType(opt)"
          />
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

      <!-- Danger zone -->
      <div class="danger-zone">
        <div class="danger-text">
          <strong>Danger zone</strong>
          <span>
            Deleting the property removes all type assignments from every
            section.
          </span>
        </div>
        <button class="btn-small danger" @click="deleteProperty">
          <i class="bi bi-trash" /> Delete Property
        </button>
      </div>
    </div>

    <!-- No property yet -->
    <p v-else class="empty-hint">
      No section types property defined for this book yet.
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

// Load properties and current section assignments when bookId changes
watch(
  () => props.bookId,
  async (bookId) => {
    if (!bookId) return;
    await propertiesStore.fetchByBook(bookId);
    await propertiesStore.fetchAllSectionValues(bookId);
  },
  { immediate: true },
);

async function createDefaultProperty() {
  if (!props.bookId) return;
  await propertiesStore.create(props.bookId, "Section Types", ["Chapter"]);
}

// Number of sections currently assigned a given type
function typeUsage(typeName) {
  const prop = sectionTypeProp.value;
  if (!prop) return 0;
  let count = 0;
  for (const values of Object.values(propertiesStore.sectionValues)) {
    for (const v of values) {
      if (v.propertyId !== prop.id) continue;
      const types = v.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (types.includes(typeName)) count++;
    }
  }
  return count;
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
  const usage = typeUsage(typeName);
  const message =
    usage > 0
      ? `Remove type "${typeName}"?\n\n${usage} section${usage === 1 ? "" : "s"} currently use${usage === 1 ? "s" : ""} it. The assignment will be removed from them.`
      : `Remove type "${typeName}"?`;
  if (!confirm(message)) return;
  const newOptions = sectionTypeProp.value.options.filter(
    (o) => o !== typeName,
  );
  await propertiesStore.update(sectionTypeProp.value.id, {
    options: newOptions,
  });
  // Server cascaded the removal: reload assignments so tree labels update
  if (props.bookId) await propertiesStore.fetchAllSectionValues(props.bookId);
}

async function deleteProperty() {
  if (!sectionTypeProp.value) return;
  if (
    !confirm(
      "Delete the Section Types property?\n\nThis removes the property and ALL type assignments from every section.",
    )
  )
    return;
  await propertiesStore.remove(sectionTypeProp.value.id);
  if (props.bookId) await propertiesStore.fetchAllSectionValues(props.bookId);
}
</script>

<style scoped>
.property-editor {
  font-size: var(--text-md);
}

.prop-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.prop-header h4 {
  margin: 0;
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.prop-description {
  margin: var(--space-2xs) 0 0;
  font-size: var(--text-sm);
  opacity: 0.7;
  max-width: 60ch;
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
  white-space: nowrap;
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

.chip-count {
  font-size: var(--text-2xs, 0.7rem);
  opacity: 0.8;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 999px;
  padding: 0 0.45em;
  min-width: 1.2em;
  text-align: center;
}

.type-chip i {
  cursor: pointer;
  font-size: 0.7em;
  opacity: 0.6;
  padding: 0.15em;
}

.type-chip i:hover {
  opacity: 1;
  color: var(--pico-del-color, #e05656);
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

.danger-zone {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  padding-top: var(--space-md);
  margin-top: var(--space-xs);
  border-top: 1px solid var(--pico-del-color, #e05656);
}

.danger-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--text-sm);
}

.danger-text strong {
  color: var(--pico-del-color, #e05656);
  font-size: var(--text-md);
}

.danger-text span {
  opacity: 0.75;
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

  .danger-zone {
    flex-direction: column;
    align-items: stretch;
  }

  .danger-zone .btn-small {
    justify-content: center;
  }
}
</style>
