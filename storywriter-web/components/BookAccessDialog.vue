<template>
  <dialog :open="open">
    <article>
      <header>
        <h3>Book Access - {{ bookName }}</h3>
        <button class="close-btn" aria-label="Close" @click="$emit('close')">
          <i class="bi bi-x-lg" />
        </button>
      </header>
      <section>
        <div v-if="loading" class="loading-indicator" />
        <template v-else>
          <table v-if="accessList.length > 0">
            <thead>
              <tr>
                <th>User</th>
                <th>Permission</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in accessList" :key="item.userId">
                <td>{{ getUserName(item.userId) }}</td>
                <td>
                  <select
                    :value="item.permission"
                    @change="updateAccess(item.userId, $event.target.value)"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </td>
                <td>
                  <button
                    class="small contrast"
                    @click="removeAccess(item.userId)"
                  >
                    <i class="bi bi-trash" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">
            No access rules defined. Admin has full access by default.
          </p>
        </template>

        <form class="add-access-form" @submit.prevent="addAccess">
          <select v-model="newUserId" required>
            <option value="" disabled>Select user</option>
            <option v-for="u in availableUsers" :key="u.id" :value="u.id">
              {{ u.name }}
            </option>
          </select>
          <select v-model="newPermission">
            <option value="read">Read</option>
            <option value="write">Write</option>
          </select>
          <button type="submit" :disabled="!newUserId">
            <i class="bi bi-plus-lg" /> Add
          </button>
        </form>
      </section>
    </article>
  </dialog>
</template>

<script setup>
import api from "../utils/api";

const props = defineProps({
  open: { type: Boolean, default: false },
  bookId: { type: String, default: null },
  bookName: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const booksStore = useBooksStore();

const loading = ref(false);
const accessList = ref([]);
const users = ref([]);
const newUserId = ref("");
const newPermission = ref("read");

const availableUsers = computed(() => {
  const assignedIds = new Set(accessList.value.map((a) => a.userId));
  return users.value.filter((u) => !assignedIds.has(u.id));
});

function getUserName(userId) {
  return users.value.find((u) => u.id === userId)?.name || userId;
}

watch(
  () => props.open,
  async (val) => {
    if (val && props.bookId) {
      loading.value = true;
      try {
        const [access, allUsers] = await Promise.all([
          booksStore.fetchAccess(props.bookId),
          api.get("/users").then((r) => r.data),
        ]);
        accessList.value = access;
        users.value = allUsers;
      } catch {
        // silent
      } finally {
        loading.value = false;
      }
    }
  },
);

async function addAccess() {
  if (!newUserId.value || !props.bookId) return;
  try {
    await booksStore.setAccess(
      props.bookId,
      newUserId.value,
      newPermission.value,
    );
    accessList.value.push({
      bookId: props.bookId,
      userId: newUserId.value,
      permission: newPermission.value,
    });
    newUserId.value = "";
    newPermission.value = "read";
  } catch {
    // silent
  }
}

async function updateAccess(userId, permission) {
  if (!props.bookId) return;
  try {
    await booksStore.setAccess(props.bookId, userId, permission);
    const item = accessList.value.find((a) => a.userId === userId);
    if (item) item.permission = permission;
  } catch {
    // silent
  }
}

async function removeAccess(userId) {
  if (!props.bookId) return;
  try {
    await booksStore.removeAccess(props.bookId, userId);
    accessList.value = accessList.value.filter((a) => a.userId !== userId);
  } catch {
    // silent
  }
}
</script>

<style scoped>
.add-access-form {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  align-items: end;
}

.add-access-form select {
  margin: 0;
}

.empty-hint {
  text-align: center;
  opacity: 0.6;
  padding: var(--space-md);
}

table select {
  margin: 0;
  padding: var(--space-2xs);
  font-size: var(--text-md);
}

button.small {
  padding: 0.2em 0.5em;
  font-size: var(--text-base);
}
</style>
