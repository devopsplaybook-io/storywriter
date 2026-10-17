import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLlmStore } from "../stores/llm";

vi.mock("../utils/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../utils/api";

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
};

describe("llm store — availability status", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.get.mockReset();
  });

  it("starts as unavailable until a status is fetched", () => {
    const store = useLlmStore();
    expect(store.available).toBe(false);
    expect(store.model).toBe("");
    expect(store.loaded).toBe(false);
  });

  it("stores available/model from the status endpoint", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { available: true, model: "deepseek-chat" },
    });
    const store = useLlmStore();
    await store.fetchStatus();
    expect(mockedApi.get).toHaveBeenCalledWith("/llm/status");
    expect(store.available).toBe(true);
    expect(store.model).toBe("deepseek-chat");
    expect(store.loaded).toBe(true);
  });

  it("treats a failed status fetch as unavailable", async () => {
    mockedApi.get.mockRejectedValueOnce(new Error("network down"));
    const store = useLlmStore();
    await store.fetchStatus();
    expect(store.available).toBe(false);
    expect(store.model).toBe("");
    expect(store.loaded).toBe(true);
  });
});
