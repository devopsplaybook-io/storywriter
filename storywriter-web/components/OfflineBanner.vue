<template>
  <div v-if="offline" class="offline-banner" role="alert">
    <i class="bi bi-wifi-off" />
    <span>
      You are offline. The app shell still works, but saving and loading need a
      connection.
    </span>
  </div>
</template>

<script setup>
const offline = ref(false);

function updateOnlineStatus() {
  offline.value = !navigator.onLine;
}

onMounted(() => {
  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
});

onUnmounted(() => {
  window.removeEventListener("online", updateOnlineStatus);
  window.removeEventListener("offline", updateOnlineStatus);
});
</script>

<style scoped>
.offline-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-2xs) var(--space-sm);
  margin-bottom: var(--space-xs);
  border-radius: var(--radius-md);
  background: var(--color-status-blocked, #dc3545);
  color: #fff;
  font-size: var(--text-sm);
  position: sticky;
  top: 0;
  z-index: 500;
  text-align: center;
}
</style>
