<template>
  <article class="book-card" @click="$emit('click')">
    <header>
      <h3>{{ book.name }}</h3>
      <span class="card-date">{{ formatDate(book.dateCreated) }}</span>
    </header>
    <p v-if="book.description" class="card-description">
      {{ book.description }}
    </p>
    <footer>
      <div class="actions">
        <i
          class="bi bi-people"
          title="Manage access"
          @click.stop="$emit('access')"
        />
        <i
          class="bi bi-download"
          title="Export"
          @click.stop="$emit('export')"
        />
        <i class="bi bi-pencil" title="Edit" @click.stop="$emit('edit')" />
        <i class="bi bi-trash" title="Delete" @click.stop="$emit('delete')" />
      </div>
    </footer>
  </article>
</template>

<script setup>
defineProps({
  book: { type: Object, required: true },
});

defineEmits(["click", "edit", "delete", "access", "export"]);

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}
</script>

<style scoped>
.book-card {
  cursor: pointer;
  padding: var(--space-md);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--pico-border-radius, 8px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
  transition: border-color var(--transition-fast);
}

.book-card:hover {
  border-color: var(--pico-primary);
}

.book-card header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.book-card header h3 {
  margin: 0;
  font-size: var(--text-lg);
}

.card-date {
  font-size: var(--text-sm);
  opacity: 0.6;
  white-space: nowrap;
}

.card-description {
  font-size: var(--text-md);
  opacity: 0.8;
  margin-bottom: var(--space-sm);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-card footer {
  display: flex;
  justify-content: flex-end;
}
</style>
