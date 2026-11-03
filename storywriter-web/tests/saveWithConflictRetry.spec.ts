import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  isConflictError,
  saveWithConflictRetry,
} from "../utils/saveWithConflictRetry";
import { useSectionsStore } from "../stores/sections";

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
  put: ReturnType<typeof vi.fn>;
};

function conflict() {
  return { response: { status: 409, data: { error: "conflict" } } };
}

function seedSection(revision: number) {
  const store = useSectionsStore();
  store.sections = [
    {
      id: "s2",
      bookId: "b1",
      parentId: null,
      type: "text",
      title: "Chapter 1",
      content: "one two three",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      dateCreated: "2026-10-16T00:00:00.000Z",
      dateUpdated: "2026-10-16T00:00:00.000Z",
      revision,
    },
  ];
  return store;
}

describe("isConflictError", () => {
  it("recognises only 409 responses", () => {
    expect(isConflictError(conflict())).toBe(true);
    expect(isConflictError({ response: { status: 400 } })).toBe(false);
    expect(isConflictError(new Error("network"))).toBe(false);
    expect(isConflictError(undefined)).toBe(false);
  });
});

describe("saveWithConflictRetry", () => {
  it("retries after a conflict with state refreshed between attempts", async () => {
    let revision = 1;
    let conflictsLeft = 2;
    const sent: number[] = [];
    const save = vi.fn(async () => {
      sent.push(revision);
      if (conflictsLeft > 0) {
        conflictsLeft -= 1;
        throw conflict();
      }
      return revision;
    });
    const refresh = vi.fn(async () => {
      revision += 1;
    });

    await saveWithConflictRetry({ save, refresh });

    expect(sent).toEqual([1, 2, 3]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("gives up after the initial attempt plus two retries", async () => {
    const save = vi.fn(async () => {
      throw conflict();
    });
    const refresh = vi.fn(() => Promise.resolve());
    const onRetry = vi.fn();

    await expect(
      saveWithConflictRetry({ save, refresh, onRetry }),
    ).rejects.toMatchObject({ response: { status: 409 } });

    expect(save).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls).toEqual([[1], [2]]);
  });

  it("rethrows non-conflict errors immediately", async () => {
    const error = { response: { status: 400 } };
    const save = vi.fn(async () => {
      throw error;
    });
    const refresh = vi.fn(() => Promise.resolve());

    await expect(saveWithConflictRetry({ save, refresh })).rejects.toBe(error);
    expect(save).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops when the refresh itself fails", async () => {
    const save = vi.fn(async () => {
      throw conflict();
    });
    const refreshError = new Error("network");
    const refresh = vi.fn(async () => {
      throw refreshError;
    });

    await expect(saveWithConflictRetry({ save, refresh })).rejects.toBe(
      refreshError,
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("page save path — automatic retry sends a fresh revision", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.put.mockReset();
    mockedApi.get.mockReset();
  });

  it("retries the PUT with the refreshed revision without user input", async () => {
    const store = seedSection(1);
    mockedApi.put
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({
        data: {
          ...store.sections[0],
          content: "one two three four",
          revision: 2,
          dateUpdated: "2026-10-17T00:00:00.000Z",
        },
      });
    // The server is now on revision 2 (the concurrent save that caused the 409)
    mockedApi.get.mockResolvedValueOnce({
      data: [
        {
          ...store.sections[0],
          content: "one two three (server edit)",
          revision: 2,
        },
      ],
    });

    const onRetry = vi.fn();
    await saveWithConflictRetry({
      save: () => store.update("s2", { content: "one two three four" }),
      refresh: () => store.fetchByBook("b1"),
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledWith(1);
    expect(mockedApi.put).toHaveBeenCalledTimes(2);
    expect(mockedApi.put.mock.calls[0][1]).toMatchObject({
      revision: 1,
      content: "one two three four",
    });
    // The retry was rebuilt from the refreshed store: no user input involved
    expect(mockedApi.put.mock.calls[1][1]).toMatchObject({
      revision: 2,
      content: "one two three four",
    });
    expect(store.sections[0].revision).toBe(2);
    expect(store.sections[0].content).toBe("one two three four");
  });
});
