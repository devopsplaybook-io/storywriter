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
        <label>
          Writing Goal (words)
          <input
            v-model.number="form.writingGoal"
            type="number"
            min="0"
            step="100"
            placeholder="0 = no goal"
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

const form = ref({ name: "", description: "", writingGoal: 0 });

watch(
  () => props.open,
  (val) => {
    if (val && props.book) {
      form.value = {
        name: props.book.name || "",
        description: props.book.description || "",
        writingGoal: Number(props.book.writingGoal) || 0,
      };
    } else if (val) {
      form.value = { name: "", description: "", writingGoal: 0 };
    }
  },
);

async function handleSubmit() {
  saving.value = true;
  try {
    const goal = Math.max(0, Math.floor(Number(form.value.writingGoal) || 0));
    emit("save", { ...form.value, writingGoal: goal });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped></style>
