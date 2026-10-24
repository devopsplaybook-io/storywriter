import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMediaStore } from "../stores/media";

vi.mock("../utils/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../utils/api";

type ApiGetResult = Awaited<ReturnType<typeof api.get>>;

const mockedGet = vi.mocked(api.get);

function okResponse(data: unknown): ApiGetResult {
  return { data } as unknown as ApiGetResult;
}

// The object-URL cache lives at module level: every test uses its own
// book/media ids so entries never leak between tests
let pairSeq = 0;

function nextPair(): [string, string] {
  pairSeq += 1;
  return [`book-${pairSeq}`, `media-${pairSeq}`];
}

let objectCounter = 0;

describe("media store URLs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const globalUrl = URL as unknown as Record<string, unknown>;
    globalUrl.createObjectURL = vi.fn(() => `blob:obj-${++objectCounter}`);
    globalUrl.revokeObjectURL = vi.fn();
  });

  it("getMediaUrl returns a tokenless URL without touching localStorage", () => {
    const storageSpy = vi.spyOn(Storage.prototype, "getItem");
    const store = useMediaStore();
    const url = store.getMediaUrl("b1", "m1");
    expect(url).toBe("/api/books/b1/media/m1/file");
    expect(url).not.toContain("token=");
    expect(storageSpy).not.toHaveBeenCalled();
    storageSpy.mockRestore();
  });

  it("fetchMediaObjectUrl fetches the blob with the shared api instance", async () => {
    const [bookId, mediaId] = nextPair();
    mockedGet.mockResolvedValueOnce(okResponse(new Blob(["x"])));
    const store = useMediaStore();
    const url = await store.fetchMediaObjectUrl(bookId, mediaId);
    expect(mockedGet).toHaveBeenCalledWith(
      `/books/${bookId}/media/${mediaId}/file`,
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(url).toMatch(/^blob:obj-/);
  });

  it("dedupes concurrent fetches per book/media pair", async () => {
    const [bookId, mediaId] = nextPair();
    mockedGet.mockResolvedValue(okResponse(new Blob(["x"])));
    const store = useMediaStore();
    const [a, b] = await Promise.all([
      store.fetchMediaObjectUrl(bookId, mediaId),
      store.fetchMediaObjectUrl(bookId, mediaId),
    ]);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);

    // Release both claims, then a new fetch hits the API again
    store.releaseMediaObjectUrl(bookId, mediaId);
    store.releaseMediaObjectUrl(bookId, mediaId);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    await store.fetchMediaObjectUrl(bookId, mediaId);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("revokes the object URL when the last claim is released", async () => {
    const [bookId, mediaId] = nextPair();
    mockedGet.mockResolvedValueOnce(okResponse(new Blob(["x"])));
    const store = useMediaStore();
    const url = await store.fetchMediaObjectUrl(bookId, mediaId);
    store.releaseMediaObjectUrl(bookId, mediaId);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    // Further releases are no-ops
    store.releaseMediaObjectUrl(bookId, mediaId);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes a fetch whose consumer released it before completion", async () => {
    const [bookId, mediaId] = nextPair();
    let resolveFetch!: (value: ApiGetResult) => void;
    mockedGet.mockImplementationOnce(
      () =>
        new Promise<ApiGetResult>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const store = useMediaStore();
    const pending = store.fetchMediaObjectUrl(bookId, mediaId);
    store.releaseMediaObjectUrl(bookId, mediaId);
    resolveFetch(okResponse(new Blob(["x"])));
    const url = await pending;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    // The entry is gone: a fresh fetch calls the API again
    mockedGet.mockResolvedValueOnce(okResponse(new Blob(["x"])));
    await store.fetchMediaObjectUrl(bookId, mediaId);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("removes the in-flight entry when the fetch fails so callers can retry", async () => {
    const [bookId, mediaId] = nextPair();
    mockedGet.mockRejectedValueOnce(new Error("403"));
    const store = useMediaStore();
    await expect(store.fetchMediaObjectUrl(bookId, mediaId)).rejects.toThrow(
      "403",
    );
    mockedGet.mockResolvedValueOnce(okResponse(new Blob(["x"])));
    await expect(store.fetchMediaObjectUrl(bookId, mediaId)).resolves.toMatch(
      /^blob:obj-/,
    );
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
