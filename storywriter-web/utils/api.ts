import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { useToastsStore } from "../stores/toasts";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A locally-valid token is one we can decode and that is not expired yet.
// The server answers 403 both for "no permission" and for missing/expired
// auth, so the local check is what keeps an expired session logging out
// while a genuine authorization error keeps the user signed in.
function hasValidLocalToken(): boolean {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (!decoded.exp || decoded.exp * 1000 <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function clearSessionAndRedirectToLogin(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSessionAndRedirectToLogin();
    } else if (error.response?.status === 403) {
      if (hasValidLocalToken()) {
        useToastsStore().error(
          "You don't have permission to perform this action.",
        );
      } else {
        clearSessionAndRedirectToLogin();
      }
    }
    return Promise.reject(error);
  },
);

export default api;
