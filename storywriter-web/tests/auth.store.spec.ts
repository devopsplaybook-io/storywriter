import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../stores/auth";

vi.mock("../utils/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("auth store — stored user", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("falls back to a logged-out state on corrupted user JSON", () => {
    localStorage.setItem("user", "{not valid json");

    const store = useAuthStore();

    expect(store.user).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(store.isAdmin).toBe(false);
    expect(store.isAuthenticated).toBe(false);
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("drops stored user values that are not a user object", () => {
    localStorage.setItem("user", JSON.stringify(["not", "a", "user"]));

    const store = useAuthStore();

    expect(store.user).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("keeps a valid stored user and reads the admin role", () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "u1", name: "Ada", role: "admin" }),
    );
    localStorage.setItem("token", "jwt");

    const store = useAuthStore();

    expect(store.user).toMatchObject({ id: "u1", name: "Ada" });
    expect(store.isAdmin).toBe(true);
    expect(store.isAuthenticated).toBe(true);
  });

  it("starts empty when nothing is stored", () => {
    const store = useAuthStore();

    expect(store.user).toBeNull();
    expect(store.token).toBe("");
  });

  it("setSession writes the token and user that login-code redemption yields", () => {
    const store = useAuthStore();

    store.setSession("jwt-1", { id: "u9", name: "Grace", role: "admin" });

    expect(store.token).toBe("jwt-1");
    expect(store.user).toMatchObject({ id: "u9", name: "Grace" });
    expect(store.isAuthenticated).toBe(true);
    expect(store.isAdmin).toBe(true);
    expect(store.currentUser).toMatchObject({ id: "u9" });
    expect(localStorage.getItem("token")).toBe("jwt-1");
    expect(JSON.parse(localStorage.getItem("user") ?? "null")).toMatchObject({
      id: "u9",
    });
  });

  it("setSession clears a stored user when the user is null", () => {
    localStorage.setItem("user", JSON.stringify({ id: "u1" }));
    const store = useAuthStore();

    store.setSession("jwt-2", null);

    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(true);
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("token")).toBe("jwt-2");
  });
});
