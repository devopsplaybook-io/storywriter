import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMediaImagesDirective,
  hydrateMediaImages,
  isMediaFileUrl,
  type MediaImageDeps,
} from "../utils/mediaImage";

function makeDeps(): MediaImageDeps & {
  fetchObjectUrl: ReturnType<typeof vi.fn>;
  releaseObjectUrl: ReturnType<typeof vi.fn>;
} {
  return {
    fetchObjectUrl: vi.fn(),
    releaseObjectUrl: vi.fn(),
  };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("isMediaFileUrl", () => {
  it("matches tokenless media file URLs", () => {
    expect(isMediaFileUrl("/api/books/b1/media/m1/file")).toBe(true);
  });

  it("matches same-origin absolute media URLs", () => {
    expect(isMediaFileUrl(`${window.location.origin}/api/books/b1/media/m1/file`)).toBe(
      true,
    );
  });

  it("rejects tokenized, foreign and unrelated URLs", () => {
    expect(isMediaFileUrl("/api/books/b1/media/m1/file?token=abc")).toBe(false);
    expect(isMediaFileUrl("https://evil.example/api/books/b1/media/m1/file")).toBe(
      false,
    );
    expect(isMediaFileUrl("/api/books/b1/media")).toBe(false);
    expect(isMediaFileUrl("blob:https://x/y")).toBe(false);
    expect(isMediaFileUrl("")).toBe(false);
    expect(isMediaFileUrl(undefined)).toBe(false);
  });
});

describe("hydrateMediaImages", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("swaps only media file img srcs for object URLs", async () => {
    deps.fetchObjectUrl.mockResolvedValue("blob:hydrated");
    const root = document.createElement("div");
    root.innerHTML =
      '<img src="/api/books/b1/media/m1/file" alt="media">' +
      '<img src="https://example.com/x.png" alt="external">' +
      '<img src="/api/books/b1/media/m1/file?token=abc" alt="tokenized">';

    await hydrateMediaImages(root, deps);

    const imgs = root.querySelectorAll("img");
    expect((imgs[0] as HTMLImageElement).src).toBe("blob:hydrated");
    expect((imgs[1] as HTMLImageElement).getAttribute("src")).toBe(
      "https://example.com/x.png",
    );
    expect(imgs[2].getAttribute("src")).toContain("token=abc");
    expect(deps.fetchObjectUrl).toHaveBeenCalledTimes(1);
    expect(deps.fetchObjectUrl).toHaveBeenCalledWith("b1", "m1");
  });

  it("keeps the original src when the fetch fails", async () => {
    deps.fetchObjectUrl.mockRejectedValue(new Error("403"));
    const root = document.createElement("div");
    root.innerHTML = '<img src="/api/books/b1/media/m2/file" alt="media">';

    await hydrateMediaImages(root, deps);

    expect(root.querySelector("img")?.getAttribute("src")).toBe(
      "/api/books/b1/media/m2/file",
    );
  });

  it("releases keys that disappear from the element", async () => {
    deps.fetchObjectUrl.mockResolvedValue("blob:hydrated");
    const root = document.createElement("div");
    root.innerHTML = '<img src="/api/books/b1/media/m1/file" alt="a">';
    await hydrateMediaImages(root, deps);

    root.innerHTML = '<img src="/api/books/b1/media/m3/file" alt="b">';
    await hydrateMediaImages(root, deps);

    expect(deps.releaseObjectUrl).toHaveBeenCalledWith("b1", "m1");
    expect(deps.fetchObjectUrl).toHaveBeenCalledWith("b1", "m3");
  });

  it("ignores non-element roots", async () => {
    await expect(
      hydrateMediaImages(null as unknown as HTMLElement, deps),
    ).resolves.toBeUndefined();
    expect(deps.fetchObjectUrl).not.toHaveBeenCalled();
  });
});

describe("createMediaImagesDirective", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("hydrates on mount and revokes on unmount", async () => {
    deps.fetchObjectUrl.mockResolvedValue("blob:mounted");
    const directive = createMediaImagesDirective(deps);
    const el = document.createElement("div");
    el.innerHTML = '<img src="/api/books/b1/media/m1/file" alt="a">';

    directive.mounted(el as never);
    await flushMicrotasks();
    expect((el.querySelector("img") as HTMLImageElement).src).toBe(
      "blob:mounted",
    );

    directive.unmounted(el as never);
    expect(deps.releaseObjectUrl).toHaveBeenCalledWith("b1", "m1");
  });

  it("hydrates again when the v-html content updates", async () => {
    deps.fetchObjectUrl.mockResolvedValue("blob:updated");
    const directive = createMediaImagesDirective(deps);
    const el = document.createElement("div");
    el.innerHTML = '<img src="/api/books/b1/media/m1/file" alt="a">';

    directive.mounted(el as never);
    await flushMicrotasks();

    el.innerHTML = '<img src="/api/books/b1/media/m4/file" alt="b">';
    directive.updated(el as never);
    await flushMicrotasks();

    expect(deps.fetchObjectUrl).toHaveBeenCalledWith("b1", "m4");
    // The replaced image's key was released, the live one is kept
    expect(deps.releaseObjectUrl).toHaveBeenCalledWith("b1", "m1");
    expect(deps.releaseObjectUrl).not.toHaveBeenCalledWith("b1", "m4");

    directive.unmounted(el as never);
    expect(deps.releaseObjectUrl).toHaveBeenCalledWith("b1", "m4");
  });
});
