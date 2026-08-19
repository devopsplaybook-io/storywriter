<template>
  <dialog :open="open">
    <article>
      <header>
        <h3>{{ isEdit ? "Edit Book" : "New Book" }}</h3>
        <button class="close-btn" aria-label="Close" @click="$emit('close')">
          <i class="bi bi-x-lg" />
        </button>
      </header>
      <form @submit.prevent="handleSubmit">
        <label>
          Title
          <input
            v-model="form.name"
            type="text"
            required
            placeholder="Book title"
          />
        </label>
        <label>
          Description
          <textarea
            v-model="form.description"
            placeholder="Brief description (optional)"
            rows="3"
          />
        </label>
        <footer class="dialog-footer">
          <button type="submit" :aria-busy="saving">
            {{ isEdit ? "Save" : "Create" }}
          </button>
          <button class="secondary" type="button" @click="$emit('close')">
            Cancel
          </button>
        </footer>
      </form>
    </article>
  </dialog>
</template>

<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  book: { type: Object, default: null },
});

const emit = defineEmits(["close", "save"]);

const saving = ref(false);

const isEdit = computed(() => !!props.book?.id);

const form = ref({ name: "", description: "" });

watch(
  () => props.open,
  (val) => {
    if (val && props.book) {
      form.value = {
        name: props.book.name || "",
        description: props.book.description || "",
      };
    } else if (val) {
      form.value = { name: "", description: "" };
    }
  },
);

async function handleSubmit() {
  saving.value = true;
  try {
    emit("save", { ...form.value });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped></style>
