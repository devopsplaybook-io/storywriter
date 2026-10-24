import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import api from "../utils/api";
import { useToastsStore } from "../stores/toasts";

function makeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

/**
 * Point the axios instance at an adapter that always fails with the given
 * status, so the response interceptor is exercised without a network.
 */
function failWith(status: number): void {
  api.defaults.adapter = async (config: unknown) => {
    const error: Record<string, unknown> = new Error(
      `Request failed with status ${status}`,
    );
    error.isAxiosError = true;
    error.config = config;
    error.response = {
      status,
      data: { error: "test" },
      headers: {},
      config,
    };
    throw error;
  };
}

describe("api response interceptor", () => {
  let originalLocation: Location;
  let locationStub: { pathname: string; href: string };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    originalLocation = window.location;
    locationStub = { pathname: "/", href: "" };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationStub,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("keeps the session and shows a toast on a 403 with a locally valid token", async () => {
    localStorage.setItem("token", makeJwt(Math.floor(Date.now() / 1000) + 3600));
    localStorage.setItem("user", JSON.stringify({ id: "u1" }));
    failWith(403);

    await expect(api.get("/books")).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(localStorage.getItem("token")).not.toBeNull();
    expect(localStorage.getItem("user")).not.toBeNull();
    expect(locationStub.href).toBe("");
    const toasts = useToastsStore();
    expect(toasts.toasts).toHaveLength(1);
    expect(toasts.toasts[0].kind).toBe("error");
    expect(toasts.toasts[0].message).toContain("permission");
  });

  it("clears the session and redirects on a 403 with an expired token", async () => {
    localStorage.setItem("token", makeJwt(Math.floor(Date.now() / 1000) - 60));
    localStorage.setItem("user", JSON.stringify({ id: "u1" }));
    failWith(403);

    await expect(api.get("/books")).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(locationStub.href).toBe("/login");
  });

  it("clears the session and redirects on a 403 without a token", async () => {
    failWith(403);

    await expect(api.get("/books")).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(locationStub.href).toBe("/login");
  });

  it("always clears the session and redirects on a 401", async () => {
    localStorage.setItem("token", makeJwt(Math.floor(Date.now() / 1000) + 3600));
    localStorage.setItem("user", JSON.stringify({ id: "u1" }));
    failWith(401);

    await expect(api.get("/books")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(locationStub.href).toBe("/login");
    expect(useToastsStore().toasts).toHaveLength(0);
  });
});
