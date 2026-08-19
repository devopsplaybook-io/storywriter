<template>
  <div class="books-page">
    <header class="page-header">
      <hgroup>
        <h1>Books</h1>
        <p>Your writing projects</p>
      </hgroup>
      <div class="header-actions">
        <button
          class="secondary"
          :aria-busy="importing"
          :disabled="importing"
          @click="triggerImport"
        >
          <i class="bi bi-upload" /> Import
        </button>
        <button @click="openCreateDialog">
          <i class="bi bi-plus-lg" /> New Book
        </button>
      </div>
    </header>

    <!-- Hidden file input for import -->
    <input
      ref="importInput"
      type="file"
      accept=".tar.gz,.tgz,application/gzip"
      style="display: none"
      @change="handleImport"
    />

    <div v-if="loading" class="loading-indicator" />

    <div v-else class="books-grid">
      <BookCard
        v-for="book in booksStore.books"
        :key="book.id"
        :book="book"
        @click="openBook(book)"
        @edit="openEditDialog(book)"
        @delete="confirmDelete(book)"
        @access="openAccessDialog(book)"
        @export="exportBook(book)"
      />
    </div>

    <div v-if="!loading && booksStore.books.length === 0" class="empty-state">
      <i class="bi bi-book" />
      <p>No books yet. Create your first book to get started!</p>
    </div>

    <!-- Create/Edit Dialog -->
    <BookDetailDialog
      :open="showDialog"
      :book="editingBook"
      @close="showDialog = false"
      @save="handleSave"
    />

    <!-- Access Dialog -->
    <BookAccessDialog
      :open="showAccess"
      :book-id="accessBookId"
      :book-name="accessBookName"
      @close="showAccess = false"
    />

    <!-- Delete Confirmation -->
    <dialog :open="deleteTarget !== null">
      <article>
        <header>
          <h3>Delete Book</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="deleteTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>
          Are you sure you want to delete "{{ deleteTarget?.name }}"? This will
          also delete all sections, properties, and version history.
        </p>
        <footer class="dialog-footer">
          <button class="secondary" @click="deleteTarget = null">Cancel</button>
          <button class="contrast" :aria-busy="deleting" @click="deleteBook">
            Delete
          </button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
const booksStore = useBooksStore();
const router = useRouter();

const loading = ref(true);
const showDialog = ref(false);
const editingBook = ref(null);
const showAccess = ref(false);
const accessBookId = ref(null);
const accessBookName = ref("");
const deleteTarget = ref(null);
const deleting = ref(false);
const importing = ref(false);
const exportingId = ref(null);
const importInput = ref(null);

async function fetchBooks() {
  loading.value = true;
  try {
    await booksStore.fetchAll();
  } catch {
    // silent
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  editingBook.value = null;
  showDialog.value = true;
}

function openEditDialog(book) {
  editingBook.value = { ...book };
  showDialog.value = true;
}

function openBook(book) {
  router.push(`/books/${book.id}`);
}

function openAccessDialog(book) {
  accessBookId.value = book.id;
  accessBookName.value = book.name;
  showAccess.value = true;
}

function confirmDelete(book) {
  deleteTarget.value = book;
}

async function handleSave(data) {
  try {
    if (editingBook.value?.id) {
      await booksStore.update(editingBook.value.id, data);
    } else {
      await booksStore.create(data.name, data.description);
    }
    showDialog.value = false;
  } catch (e) {
    alert(e.response?.data?.error || "Failed to save book");
  }
}

async function deleteBook() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await booksStore.remove(deleteTarget.value.id);
    deleteTarget.value = null;
  } catch (e) {
    alert(e.response?.data?.error || "Failed to delete book");
  } finally {
    deleting.value = false;
  }
}

async function exportBook(book) {
  exportingId.value = book.id;
  try {
    await booksStore.exportBook(book.id);
  } catch (e) {
    alert(e.response?.data?.error || "Failed to export book");
  } finally {
    exportingId.value = null;
  }
}

function triggerImport() {
  importInput.value?.click();
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importing.value = true;
  try {
    await booksStore.importBook(file);
  } catch (e) {
    alert(e.response?.data?.error || "Failed to import book");
  } finally {
    importing.value = false;
    event.target.value = "";
  }
}

onMounted(async () => {
  await fetchBooks();
});
</script>

<style scoped>
.books-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
}

.empty-state {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 3em;
  color: var(--pico-muted-color);
  gap: var(--space-sm);
}

.empty-state i {
  font-size: var(--text-icon, 3rem);
}

/* Mobile: single column, tighter spacing */
@media (max-width: 768px) {
  .books-page {
    padding: 0;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }

  .header-actions {
    flex-direction: row;
  }

  .header-actions button {
    flex: 1;
    width: 100%;
    justify-content: center;
  }

  .books-grid {
    grid-template-columns: 1fr;
    gap: var(--space-sm);
  }

  .empty-state {
    padding: 2em 1em;
  }
}
</style>
