<template>
  <div class="login-container">
    <div class="login-grid">
      <article class="login-card">
        <header>
          <hgroup>
            <h1>Storywriter</h1>
            <p v-if="needsSetup">Create your admin account to get started</p>
            <p v-else>Sign in to your account</p>
          </hgroup>
        </header>

        <form @submit.prevent="handleSubmit">
          <div v-if="error" class="error-message">{{ error }}</div>

          <label>
            Username
            <input
              ref="nameInput"
              v-model="name"
              type="text"
              placeholder="Your username"
              required
              autocomplete="username"
            />
          </label>

          <label>
            Password
            <input
              v-model="password"
              type="password"
              placeholder="Your password"
              required
              :minlength="needsSetup ? PASSWORD_MIN_LENGTH : undefined"
              autocomplete="current-password"
            />
            <small v-if="needsSetup">{{ PasswordMinimumHint() }}</small>
          </label>

          <label v-if="needsSetup">
            Confirm Password
            <input
              v-model="passwordConfirm"
              type="password"
              placeholder="Confirm password"
              required
              autocomplete="new-password"
            />
          </label>

          <footer>
            <button type="submit" :aria-busy="loading">
              {{ needsSetup ? "Create Admin Account" : "Login" }}
            </button>
          </footer>
        </form>
      </article>

      <LoginWithCodeCard
        v-if="showLoginCode"
        :service="loginCodeService"
        class="login-card login-code-card"
        @use-password="focusUsername"
      />
    </div>
  </div>
</template>

<script setup>
import api from "../utils/api";
import {
  PASSWORD_MIN_LENGTH,
  PasswordMinimumHint,
  PasswordTooShort,
} from "../utils/passwordPolicy";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import {
  createAppLoginCodeService,
  LoginCodeIsAvailable,
} from "../utils/loginCodes";
const authStore = useAuthStore();
const router = useRouter();

const name = ref("");
const password = ref("");
const passwordConfirm = ref("");
const loading = ref(false);
const error = ref("");
const needsSetup = ref(false);
const setupChecked = ref(false);
const loginCodeAvailable = ref(false);
const nameInput = ref(null);

const loginCodeService = createAppLoginCodeService((token, user) =>
  authStore.setSession(token, user),
);

const showLoginCode = computed(
  () =>
    setupChecked.value &&
    !needsSetup.value &&
    !authStore.isAuthenticated &&
    loginCodeAvailable.value,
);

function focusUsername() {
  nameInput.value?.focus();
}

// The code card unmounts as soon as the session is stored, so navigation
// cannot rely on its approved event.
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) router.push("/");
  },
);

onMounted(async () => {
  await authStore.init();
  if (authStore.isAuthenticated) {
    router.push("/");
    return;
  }
  try {
    const res = await api.get("/users/status/initialization");
    needsSetup.value = !res.data.initialized;
    if (!needsSetup.value) {
      loginCodeAvailable.value = await LoginCodeIsAvailable(loginCodeService);
    }
  } catch (e) {
    console.error("Could not determine setup state", e);
    error.value =
      "Could not determine setup state. Check your connection and reload.";
  }
  setupChecked.value = true;
});

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    if (needsSetup.value) {
      if (password.value !== passwordConfirm.value) {
        error.value = "Passwords do not match";
        loading.value = false;
        return;
      }
      if (PasswordTooShort(password.value)) {
        error.value = PasswordMinimumHint();
        loading.value = false;
        return;
      }
      await api.post("/users", { name: name.value, password: password.value });
    }
    await authStore.login(name.value, password.value);
    router.push("/");
  } catch (e) {
    error.value = e.response?.data?.error || "An error occurred";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  display: grid;
  place-items: center;
  min-height: 80vh;
  padding: var(--space-md);
}

.login-grid {
  display: grid;
  width: 100%;
  gap: var(--space-lg);
  grid-template-columns: repeat(auto-fit, minmax(320px, 400px));
  justify-content: center;
  align-items: start;
}

.login-card {
  width: 100%;
}

.error-message {
  color: var(--pico-del-color);
  margin-bottom: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--pico-del-color);
  border-radius: var(--radius-sm);
}

footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  align-items: center;
}

@media (max-width: 768px) {
  .login-grid {
    grid-template-columns: 1fr;
  }

  .login-card {
    max-width: none;
  }
}
</style>
