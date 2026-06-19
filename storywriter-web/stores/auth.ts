import { acceptHMRUpdate, defineStore } from "pinia";
import { jwtDecode } from "jwt-decode";
import api from "../utils/api";

export interface ApiToken {
  id: string;
  name: string;
  dateCreated: string;
  tokenPrefix?: string;
  token?: string;
}

export interface UserSession {
  isAuthenticated: boolean;
  userId?: string;
  userName?: string;
  role?: "admin" | "user";
}

interface JwtPayload {
  exp: number;
  userId: string;
  userName: string;
  role: "admin" | "user";
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("token") || "",
    user: JSON.parse(localStorage.getItem("user") || "null") as Record<
      string,
      unknown
    > | null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === "admin",
    currentUser: (state) => state.user,
  },

  actions: {
    async init() {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const decoded = jwtDecode<JwtPayload>(token);
          if (decoded.exp * 1000 > Date.now()) {
            this.token = token;
            try {
              const res = await api.post("/users/session", {});
              this.user = res.data.user;
              localStorage.setItem("user", JSON.stringify(this.user));
            } catch {
              this.logout();
            }
          } else {
            this.logout();
          }
        } catch {
          this.logout();
        }
      }
      this.initialized = true;
    },

    async login(name: string, password: string) {
      const res = await api.post("/users/session", { name, password });
      this.token = res.data.token;
      this.user = res.data.user;
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      return res.data;
    },

    async register(name: string, password: string) {
      const res = await api.post("/users", { name, password });
      return res.data;
    },

    async changePassword(passwordOld: string, password: string) {
      await api.put("/users/password", { passwordOld, password });
    },

    async fetchTokens(): Promise<ApiToken[]> {
      const res = await api.get("/users/tokens");
      return res.data;
    },

    async createToken(name: string): Promise<ApiToken> {
      const res = await api.post("/users/tokens", { name });
      return res.data;
    },

    async deleteToken(id: string) {
      await api.delete(`/users/tokens/${id}`);
    },

    logout() {
      this.token = "";
      this.user = null;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
