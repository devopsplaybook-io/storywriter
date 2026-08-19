<template>
  <div class="settings">
    <h1><i class="bi bi-gear" /> Settings</h1>

    <section>
      <h2>Appearance</h2>
      <div class="setting-row">
        <span class="setting-label"><i class="bi bi-palette" /> Theme</span>
        <div class="theme-controls">
          <span class="theme-name">{{ themeLabel }}</span>
          <button class="btn-theme" @click="toggleTheme()">
            <i :class="getThemeIcon()" />
            {{
              themeLabel === "System"
                ? "Follow system"
                : themeLabel === "Dark"
                  ? "Switch to light"
                  : "Switch to dark"
            }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="authStore.isAuthenticated">
      <h2>Account</h2>
      <p class="user-info" v-if="authStore.currentUser">
        Signed in as <strong>{{ authStore.currentUser.name }}</strong>
      </p>

      <div class="setting-row">
        <span class="setting-label"><i class="bi bi-key" /> Password</span>
        <button class="btn-setting" @click="showPasswordDialog = true">
          Change Password
        </button>
      </div>

      <button class="btn-logout" @click="handleLogout">
        <i class="bi bi-box-arrow-right" /> Logout
      </button>
    </section>

    <section v-if="authStore.isAuthenticated">
      <h2>API Tokens</h2>
      <p class="section-desc">
        API tokens allow external applications to authenticate as your account.
      </p>

      <div v-if="tokensLoading" class="loading-indicator" />
      <div v-else>
        <table v-if="apiTokens.length > 0" class="tokens-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Token</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in apiTokens" :key="t.id">
              <td>{{ t.name }}</td>
              <td class="token-prefix">
                <code>{{ t.tokenPrefix || t.token }}</code>
              </td>
              <td>{{ formatDate(t.dateCreated) }}</td>
              <td>
                <button
                  class="btn-icon-sm contrast"
                  title="Revoke token"
                  @click="confirmRevokeToken(t)"
                >
                  <i class="bi bi-trash" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">No API tokens created yet.</p>
      </div>

      <div class="create-token-row">
        <button @click="showCreateTokenDialog = true">
          <i class="bi bi-plus-lg" /> Create Token
        </button>
      </div>
    </section>

    <!-- Change Password Dialog -->
    <dialog :open="showPasswordDialog">
      <article>
        <header>
          <h3>Change Password</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="showPasswordDialog = false"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <form @submit.prevent="changePassword">
          <label>
            Current Password
            <input
              v-model="passwordOld"
              type="password"
              required
              autocomplete="current-password"
            />
          </label>
          <label>
            New Password
            <input
              v-model="passwordNew"
              type="password"
              required
              autocomplete="new-password"
            />
          </label>
          <label>
            Confirm New Password
            <input
              v-model="passwordConfirm"
              type="password"
              required
              autocomplete="new-password"
            />
          </label>
          <div v-if="passwordError" class="error-message">
            {{ passwordError }}
          </div>
          <div v-if="passwordSuccess" class="success-message">
            Password changed successfully.
          </div>
          <footer class="dialog-footer">
            <button type="submit" :aria-busy="changingPassword">
              Change Password
            </button>
            <button
              class="secondary"
              type="button"
              @click="showPasswordDialog = false"
            >
              Cancel
            </button>
          </footer>
        </form>
      </article>
    </dialog>

    <!-- Create Token Dialog -->
    <dialog :open="showCreateTokenDialog">
      <article>
        <header>
          <h3>Create API Token</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="closeCreateTokenDialog"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>

        <div v-if="newTokenValue">
          <p class="token-warning">
            <i class="bi bi-exclamation-triangle" />
            Copy this token now. It won't be shown again.
          </p>
          <div class="token-display">
            <code>{{ newTokenValue }}</code>
            <button class="btn-icon-sm" title="Copy" @click="copyToken">
              <i class="bi bi-clipboard" />
            </button>
          </div>
          <p v-if="tokenCopied" class="success-message">Copied to clipboard.</p>
          <footer class="dialog-footer">
            <button @click="closeCreateTokenDialog">Done</button>
          </footer>
        </div>

        <form v-else @submit.prevent="createToken">
          <label>
            Token Name
            <input
              v-model="newTokenName"
              type="text"
              required
              placeholder="e.g. CI/CD, Script, Integration"
            />
          </label>
          <footer class="dialog-footer">
            <button type="submit" :aria-busy="creatingToken">Create</button>
            <button
              class="secondary"
              type="button"
              @click="closeCreateTokenDialog"
            >
              Cancel
            </button>
          </footer>
        </form>
      </article>
    </dialog>

    <!-- Revoke Token Confirmation -->
    <dialog :open="revokeTarget !== null">
      <article>
        <header>
          <h3>Revoke Token</h3>
          <button
            class="close-btn"
            aria-label="Close"
            @click="revokeTarget = null"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>
        <p>
          Are you sure you want to revoke token "<strong>{{
            revokeTarget?.name
          }}</strong
          >"? Any application using this token will lose access.
        </p>
        <footer class="dialog-footer">
          <button class="secondary" @click="revokeTarget = null">Cancel</button>
          <button class="contrast" @click="revokeToken">Revoke</button>
        </footer>
      </article>
    </dialog>
  </div>
</template>

<script setup>
const authStore = useAuthStore();
const router = useRouter();
const toggleTheme = inject("toggleTheme");
const theme = inject("theme");

// Password change
const showPasswordDialog = ref(false);
const passwordOld = ref("");
const passwordNew = ref("");
const passwordConfirm = ref("");
const passwordError = ref("");
const passwordSuccess = ref(false);
const changingPassword = ref(false);

// API tokens
const apiTokens = ref([]);
const tokensLoading = ref(false);
const showCreateTokenDialog = ref(false);
const newTokenName = ref("");
const newTokenValue = ref("");
const tokenCopied = ref(false);
const creatingToken = ref(false);
const revokeTarget = ref(null);

const themeLabel = computed(() => {
  if (!theme?.value) return "System";
  return theme.value.charAt(0).toUpperCase() + theme.value.slice(1);
});

function getThemeIcon() {
  const current = theme?.value;
  if (current === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "bi bi-moon"
      : "bi bi-sun";
  }
  return current === "dark" ? "bi bi-moon" : "bi bi-sun";
}

async function changePassword() {
  passwordError.value = "";
  passwordSuccess.value = false;
  if (passwordNew.value !== passwordConfirm.value) {
    passwordError.value = "Passwords do not match";
    return;
  }
  changingPassword.value = true;
  try {
    await authStore.changePassword(passwordOld.value, passwordNew.value);
    passwordSuccess.value = true;
    passwordOld.value = "";
    passwordNew.value = "";
    passwordConfirm.value = "";
    setTimeout(() => {
      showPasswordDialog.value = false;
      passwordSuccess.value = false;
    }, 1500);
  } catch (e) {
    passwordError.value =
      e.response?.data?.error || "Failed to change password";
  } finally {
    changingPassword.value = false;
  }
}

function handleLogout() {
  authStore.logout();
  router.push("/login");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

async function loadTokens() {
  tokensLoading.value = true;
  try {
    apiTokens.value = await authStore.fetchTokens();
  } catch {
    // silent
  } finally {
    tokensLoading.value = false;
  }
}

async function createToken() {
  if (!newTokenName.value) return;
  creatingToken.value = true;
  tokenCopied.value = false;
  try {
    const result = await authStore.createToken(newTokenName.value);
    newTokenValue.value = result.token;
    apiTokens.value.unshift({
      id: result.id,
      name: result.name,
      dateCreated: result.dateCreated,
      tokenPrefix: result.token.substring(0, 20) + "...",
    });
  } catch {
    // silent
  } finally {
    creatingToken.value = false;
  }
}

function closeCreateTokenDialog() {
  showCreateTokenDialog.value = false;
  newTokenName.value = "";
  newTokenValue.value = "";
  tokenCopied.value = false;
}

async function copyToken() {
  if (!newTokenValue.value) return;
  try {
    await navigator.clipboard.writeText(newTokenValue.value);
    tokenCopied.value = true;
  } catch {
    // Fallback: select text
    const el = document.querySelector(".token-display code");
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  }
}

function confirmRevokeToken(token) {
  revokeTarget.value = token;
}

async function revokeToken() {
  if (!revokeTarget.value) return;
  try {
    await authStore.deleteToken(revokeTarget.value.id);
    apiTokens.value = apiTokens.value.filter(
      (t) => t.id !== revokeTarget.value.id,
    );
    revokeTarget.value = null;
  } catch {
    // silent
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await loadTokens();
  }
});
</script>

<style scoped>
.settings {
  max-width: 600px;
  margin: 0 auto;
}

.settings h1 {
  font-size: var(--text-xl);
  margin-bottom: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

section {
  margin-bottom: var(--space-lg);
  padding: var(--space-md);
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--pico-border-radius, 8px);
  background: var(--pico-card-background-color, rgba(255, 255, 255, 0.02));
}

section h2 {
  font-size: var(--text-default);
  margin-bottom: var(--space-sm);
  color: var(--pico-muted-color);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
}

.section-desc {
  font-size: var(--text-sm);
  color: var(--pico-muted-color);
  margin-bottom: var(--space-md);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-weight: var(--weight-medium);
}

.theme-controls {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.theme-name {
  font-size: var(--text-md);
  opacity: 0.7;
  min-width: 3em;
}

.btn-theme,
.btn-setting {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 0.4em 0.8em;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--pico-border-radius, 4px);
  background: transparent;
  color: var(--pico-color);
  cursor: pointer;
  font-size: var(--text-md);
  font-family: inherit;
}

.btn-theme:hover,
.btn-setting:hover {
  background: var(--pico-primary-background, #1095c1);
  color: var(--pico-primary-inverse, #fff);
}

.user-info {
  margin-bottom: var(--space-sm);
  font-size: var(--text-md);
}

.error-message {
  color: var(--pico-del-color);
  margin-bottom: var(--space-sm);
  padding: var(--space-xs);
  font-size: var(--text-sm);
}

.success-message {
  color: var(--pico-ins-color, #4caf50);
  margin-bottom: var(--space-sm);
  padding: var(--space-xs);
  font-size: var(--text-sm);
}

.btn-logout {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 0.4em 0.8em;
  border: 1px solid var(--pico-muted-border-color, #444);
  border-radius: var(--pico-border-radius, 4px);
  background: transparent;
  color: var(--pico-color);
  cursor: pointer;
  font-size: var(--text-md);
  font-family: inherit;
  margin-top: var(--space-md);
}

.btn-logout:hover {
  background: #d32f2f;
  color: #fff;
  border-color: #d32f2f;
}

/* API Tokens */
.tokens-table {
  font-size: var(--text-sm);
}

.token-prefix code {
  font-size: var(--text-xs);
  word-break: break-all;
}

.create-token-row {
  margin-top: var(--space-md);
}

.token-warning {
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-sm);
  color: #ffc107;
}

.token-display {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--pico-code-background-color, rgba(0, 0, 0, 0.2));
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
  margin: var(--space-sm) 0;
}

.token-display code {
  flex: 1;
  word-break: break-all;
  font-size: var(--text-xs);
  user-select: all;
}

.btn-icon-sm {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-2xs);
  font-size: var(--text-md);
  color: var(--pico-muted-color);
  border-radius: var(--radius-sm);
}

.btn-icon-sm:hover {
  color: var(--pico-primary);
}

/* Mobile: stack setting rows */
@media (max-width: 768px) {
  .settings {
    padding: 0;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .theme-controls {
    flex-wrap: wrap;
  }

  .tokens-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
