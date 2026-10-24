import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useBooksStore } from "../stores/books";

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
  post: ReturnType<typeof vi.fn>;
};

function mockDownload() {
  const created: HTMLAnchorElement[] = [];
  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = originalCreate(tag);
    if (tag === "a") created.push(el as HTMLAnchorElement);
    return el;
  });
  window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  window.URL.revokeObjectURL = vi.fn();
  return created;
}

describe("books store — exportBook", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.get.mockReset();
    vi.restoreAllMocks();
  });

  it("requests the export with format and include params", async () => {
    mockDownload();
    mockedApi.get.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: { "x-filename": "My_Book.epub" },
    });
    const store = useBooksStore();
    await store.exportBook("b1", "epub", "full");
    expect(mockedApi.get).toHaveBeenCalledWith("/books/b1/export", {
      responseType: "blob",
      params: { format: "epub", include: "full" },
    });
  });

  it("uses the X-Filename header for the download", async () => {
    const created = mockDownload();
    mockedApi.get.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: { "x-filename": "My_Book.epub" },
    });
    const store = useBooksStore();
    await store.exportBook("b1", "epub");
    expect(created).toHaveLength(1);
    expect(created[0].download).toBe("My_Book.epub");
  });

  it("falls back to a format-based filename when the header is missing", async () => {
    const created = mockDownload();
    mockedApi.get.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: {},
    });
    const store = useBooksStore();
    await store.exportBook("b1", "markdown");
    expect(created).toHaveLength(1);
    expect(created[0].download).toBe("book-export.md");
  });

  it("defaults to the backup archive format", async () => {
    mockDownload();
    mockedApi.get.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: {},
    });
    const store = useBooksStore();
    await store.exportBook("b1");
    expect(mockedApi.get).toHaveBeenCalledWith("/books/b1/export", {
      responseType: "blob",
      params: { format: "targz", include: "content" },
    });
  });
});

describe("books store — importBook", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApi.post.mockReset();
  });

  it("posts the file as multipart to /books/import and adds the book", async () => {
    const file = new File(["archive-bytes"], "book.tar.gz", {
      type: "application/gzip",
    });
    const created = { id: "b2", name: "Imported" };
    mockedApi.post.mockResolvedValueOnce({ data: created });

    const store = useBooksStore();
    const result = await store.importBook(file);

    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    const [url, formData, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe("/books/import");
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("file")).toBe(file);
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
    expect(result).toEqual(created);
    expect(store.books).toContainEqual(created);
  });
});
