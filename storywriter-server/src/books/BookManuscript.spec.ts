import { Book } from "../model/Book";
import { Section } from "../model/Section";
import * as fs from "fs-extra";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { AddressInfo } from "net";
import {
  BookManuscriptCompile,
  CompiledBlock,
  CompiledBook,
  ManuscriptMediaRef,
  MediaFileLoader,
  RenderManuscriptDocx,
  RenderManuscriptEpub,
  RenderManuscriptMarkdown,
  SanitizeManuscriptHtml,
  SanitizeManuscriptMarkdown,
  isRemoteImageRef,
  resolveMediaSlug,
} from "./BookManuscript";

// Reads a named entry out of a raw zip buffer via its central directory
function readZipEntry(buffer: Buffer, entryName: string): Buffer {
  const cdSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let pos = buffer.indexOf(cdSig);
  while (pos >= 0) {
    const method = buffer.readUInt16LE(pos + 10);
    const compSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString();
    if (name === entryName) {
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
    }
    pos = buffer.indexOf(cdSig, pos + 46 + nameLen + extraLen + commentLen);
  }
  throw new Error(`Zip entry not found: ${entryName}`);
}

function makeBook(): Book {
  const book = new Book();
  book.name = "My Book";
  book.description = "A test book";
  return book;
}

function makeSection(partial: Partial<Section> & { id: string }): Section {
  const section = new Section();
  Object.assign(section, partial);
  return section;
}

function makeSections(): Section[] {
  return [
    makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
    makeSection({
      id: "ch1",
      parentId: "root",
      type: "text",
      title: "Chapter 1",
      content: "Hello **world**",
      orderIndex: 2,
    }),
    makeSection({
      id: "part",
      parentId: "root",
      type: "container",
      title: "Part One",
      orderIndex: 1,
    }),
    makeSection({
      id: "ch2",
      parentId: "part",
      type: "text",
      title: "Chapter 2",
      content: "Deep content",
      orderIndex: 0,
    }),
    makeSection({
      id: "media1",
      parentId: "root",
      type: "media",
      title: "Cover",
      mediaId: "media-1",
      caption: "The *cover* image",
      orderIndex: 0,
    }),
  ];
}

const MEDIA_ITEMS: ManuscriptMediaRef[] = [
  { id: "media-1", slug: "cover", filename: "cover.png", mimeType: "image/png" },
];

function makeLoader(
  result: { buffer: Buffer; mimeType: string } | null = {
    buffer: Buffer.from("png-bytes"),
    mimeType: "image/png",
  },
): MediaFileLoader {
  return async () => result;
}

function flatten(blocks: CompiledBlock[][]): CompiledBlock[] {
  return blocks.flat();
}

describe("BookManuscript — resolveMediaSlug", () => {
  it("resolves a slug with and without extension", () => {
    expect(resolveMediaSlug(MEDIA_ITEMS, "cover.png")?.id).toBe("media-1");
    expect(resolveMediaSlug(MEDIA_ITEMS, "cover")?.id).toBe("media-1");
  });

  it("returns null for unknown slugs", () => {
    expect(resolveMediaSlug(MEDIA_ITEMS, "unknown.png")).toBeNull();
  });
});

describe("BookManuscriptCompile", () => {
  it("compiles sections in tree order with shuffled orderIndex", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const headings = flatten(compiled.chapters).filter(
      (b) => b.kind === "heading",
    ) as Extract<CompiledBlock, { kind: "heading" }>[];
    expect(headings.map((h) => h.text)).toEqual([
      "Cover",
      "Part One",
      "Chapter 2",
      "Chapter 1",
    ]);
  });

  it("maps depth to heading levels and skips the root title", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const headings = flatten(compiled.chapters).filter(
      (b) => b.kind === "heading",
    ) as Extract<CompiledBlock, { kind: "heading" }>[];
    expect(headings.map((h) => h.level)).toEqual([1, 1, 2, 1]);
    expect(headings.some((h) => h.text === "Root")).toBe(false);
  });

  it("produces an image block with caption for media sections", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const imageBlocks = flatten(compiled.chapters).filter(
      (b) => b.kind === "image",
    ) as Extract<CompiledBlock, { kind: "image" }>[];
    expect(imageBlocks).toHaveLength(1);
    expect(imageBlocks[0].alt).toBe("Cover");
    expect(imageBlocks[0].caption).toBe("The *cover* image");
    expect(imageBlocks[0].media?.buffer.toString()).toBe("png-bytes");
  });

  it("resolves content image slugs with and without extension", async () => {
    const sections = [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content: "![a](cover.png) and ![b](cover)",
        orderIndex: 0,
      }),
    ];
    const compiled = await BookManuscriptCompile(
      makeBook(),
      sections,
      MEDIA_ITEMS,
      makeLoader(),
    );
    const mdBlocks = flatten(compiled.chapters).filter(
      (b) => b.kind === "markdown",
    ) as Extract<CompiledBlock, { kind: "markdown" }>[];
    expect(mdBlocks[0].images).toHaveLength(1);
    expect(mdBlocks[0].markdown).not.toContain("cover");
    expect(mdBlocks[0].markdown).toContain("{{storywriter-media:0}}");
  });

  it("keeps unresolved content image slugs as-is", async () => {
    const sections = [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content: "![c](unknown-slug)",
        orderIndex: 0,
      }),
    ];
    const compiled = await BookManuscriptCompile(
      makeBook(),
      sections,
      MEDIA_ITEMS,
      makeLoader(),
    );
    const mdBlocks = flatten(compiled.chapters).filter(
      (b) => b.kind === "markdown",
    ) as Extract<CompiledBlock, { kind: "markdown" }>[];
    expect(mdBlocks[0].markdown).toBe("![c](unknown-slug)");
    expect(mdBlocks[0].images).toHaveLength(0);
  });

  it("omits analysis and labels with include=content", async () => {
    const sections = [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content: "Text",
        analysis: "AI wrote this",
        orderIndex: 0,
      }),
    ];
    const compiled = await BookManuscriptCompile(
      makeBook(),
      sections,
      MEDIA_ITEMS,
      makeLoader(),
      { include: "content" },
      { ch1: ["Chapter"] },
    );
    const all = flatten(compiled.chapters);
    expect(all.some((b) => b.kind === "heading" && b.text === "AI Notes")).toBe(
      false,
    );
    expect(
      all.some((b) => b.kind === "markdown" && b.markdown.includes("Labels:")),
    ).toBe(false);
    expect(
      all.some(
        (b) => b.kind === "markdown" && b.markdown.includes("AI wrote this"),
      ),
    ).toBe(false);
  });

  it("includes AI notes and labels with include=full", async () => {
    const sections = [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content: "Text",
        analysis: "AI wrote this",
        orderIndex: 0,
      }),
    ];
    const compiled = await BookManuscriptCompile(
      makeBook(),
      sections,
      MEDIA_ITEMS,
      makeLoader(),
      { include: "full" },
      { ch1: ["Chapter", "Draft"] },
    );
    const all = flatten(compiled.chapters);
    const notesHeading = all.find(
      (b) => b.kind === "heading" && b.text === "AI Notes",
    ) as Extract<CompiledBlock, { kind: "heading" }> | undefined;
    expect(notesHeading?.level).toBe(2);
    expect(
      all.some(
        (b) => b.kind === "markdown" && b.markdown.includes("AI wrote this"),
      ),
    ).toBe(true);
    expect(
      all.some(
        (b) =>
          b.kind === "markdown" && b.markdown.includes("*Labels: Chapter, Draft*"),
      ),
    ).toBe(true);
  });

  it("inserts a placeholder when the media file is missing on disk", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(null),
    );
    const imageBlocks = flatten(compiled.chapters).filter(
      (b) => b.kind === "image",
    ) as Extract<CompiledBlock, { kind: "image" }>[];
    expect(imageBlocks[0].media).toBeNull();
    expect(imageBlocks[0].missingLabel).toBe("[missing image: cover]");

    const markdown = RenderManuscriptMarkdown(compiled, makeBook());
    expect(markdown).toContain("[missing image: cover]");
  });
});

describe("RenderManuscriptMarkdown", () => {
  it("emits YAML front matter with title and description", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const markdown = RenderManuscriptMarkdown(compiled, makeBook());
    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain('title: "My Book"');
    expect(markdown).toContain('description: "A test book"');
  });

  it("renders heading levels by depth and content markdown", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const markdown = RenderManuscriptMarkdown(compiled, makeBook());
    expect(markdown).toContain("# Cover");
    expect(markdown).toContain("# Part One");
    expect(markdown).toContain("## Chapter 2");
    expect(markdown).toContain("# Chapter 1");
    expect(markdown).toContain("Hello **world**");
    expect(markdown).toContain("The *cover* image");
  });

  it("embeds images as base64 data URIs", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const markdown = RenderManuscriptMarkdown(compiled, makeBook());
    expect(markdown).toContain(
      "![Cover](data:image/png;base64,cG5nLWJ5dGVz)",
    );
  });
});

describe("RenderManuscriptDocx", () => {
  it("returns a non-empty Buffer with zip magic", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const buffer = await RenderManuscriptDocx(compiled, makeBook());
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("RenderManuscriptEpub", () => {
  let epubTmpDir: string;

  beforeAll(async () => {
    epubTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storywriter-epub-"));
  });

  afterAll(async () => {
    if (epubTmpDir) {
      await fs.remove(epubTmpDir);
    }
  });

  async function RenderEpubToBuffer(compiled: CompiledBook): Promise<Buffer> {
    const tmpFile = await RenderManuscriptEpub(compiled, makeBook(), epubTmpDir);
    expect(path.basename(tmpFile)).toMatch(/^epub-.+\.epub$/);
    expect(fs.existsSync(tmpFile)).toBe(true);
    return fs.readFile(tmpFile);
  }

  it("writes a non-empty file with zip magic and a stored mimetype first entry", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const buffer = await RenderEpubToBuffer(compiled);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    // mimetype must be the first entry, stored uncompressed
    expect(buffer.indexOf("mimetypeapplication/epub+zip")).toBe(30);
  });

  it("contains the book title and chapter files", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const buffer = await RenderEpubToBuffer(compiled);
    const opf = readZipEntry(buffer, "OEBPS/content.opf").toString("utf8");
    expect(opf).toContain("<dc:title>My Book</dc:title>");
    expect(opf).toContain('href="ch1.xhtml"');
    const nav = readZipEntry(buffer, "OEBPS/nav.xhtml").toString("utf8");
    expect(nav).toContain("Part One");
    const ch2 = readZipEntry(buffer, "OEBPS/ch2.xhtml").toString("utf8");
    expect(ch2).toContain("Chapter 2");
    expect(ch2).toContain("Deep content");
  });
});

describe("remote image hardening (SSRF)", () => {
  let listener: http.Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    listener = http.createServer((_req, res) => {
      hits++;
      res.setHeader("Content-Type", "image/png");
      res.end(Buffer.from("remote-secret-bytes"));
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", () => resolve()),
    );
    port = (listener.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });

  function remoteSections(): Section[] {
    return [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "cover",
        parentId: "root",
        type: "media",
        title: "Cover",
        mediaId: "media-1",
        caption: `Caption ![cap](http://127.0.0.1:${port}/cap.png)`,
        orderIndex: 0,
      }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content:
          `Intro ![remote](http://127.0.0.1:${port}/pixel.png) ` +
          `and ![cover](cover.png)\n\n` +
          `<img src="http://127.0.0.1:${port}/raw.png" alt="raw">`,
        analysis: `Note ![note](http://127.0.0.1:${port}/note.png)`,
        orderIndex: 1,
      }),
    ];
  }

  it("classifies remote image references", () => {
    expect(isRemoteImageRef("http://127.0.0.1/x.png")).toBe(true);
    expect(isRemoteImageRef("https://example.com/x.png")).toBe(true);
    expect(isRemoteImageRef("//example.com/x.png")).toBe(true);
    expect(isRemoteImageRef("data:text/html,<b>x</b>")).toBe(true);
    expect(isRemoteImageRef("data:image/png;base64,AAAA")).toBe(false);
    expect(isRemoteImageRef("cover.png")).toBe(false);
    expect(isRemoteImageRef("unknown-slug")).toBe(false);
  });

  it("sanitizes markdown images and raw HTML images", () => {
    const markdown =
      "![remote](http://example.com/x.png) ![local](cover.png)\n" +
      '<img src="http://example.com/raw.png" alt="raw" srcset="http://example.com/2x.png">';
    const sanitized = SanitizeManuscriptMarkdown(markdown);
    expect(sanitized).toContain("[missing image: remote]");
    expect(sanitized).toContain("[missing image: raw]");
    expect(sanitized).toContain("![local](cover.png)");
    expect(sanitized).not.toContain("example.com");
    // Idempotent
    expect(SanitizeManuscriptMarkdown(sanitized)).toBe(sanitized);
  });

  it("keeps only local data images in generated HTML", () => {
    const html =
      '<script src="http://example.com/x.js"></script>' +
      '<iframe src="http://example.com/frame"></iframe>' +
      '<img src="data:image/png;base64,AAAA" srcset="http://example.com/2x.png">' +
      '<img src="http://example.com/x.png" alt="remote">' +
      '<img src="media/img-1.png" alt="epub-media">';
    const docx = SanitizeManuscriptHtml(html, "docx");
    expect(docx).toContain("data:image/png;base64,AAAA");
    expect(docx).not.toContain("srcset");
    expect(docx).not.toContain("http://example.com");
    expect(docx).not.toContain("<script");
    expect(docx).not.toContain("<iframe");
    expect(docx).toContain("[missing image: remote]");
    expect(docx).toContain("[missing image: epub-media]");

    const epub = SanitizeManuscriptHtml(html, "epub");
    expect(epub).toContain('src="media/img-1.png"');
    expect(epub).not.toContain("http://example.com");
  });

  it("replaces remote images at compile time but keeps unknown local slugs", async () => {
    const sections = [
      makeSection({ id: "root", parentId: null, type: "container", title: "Root" }),
      makeSection({
        id: "ch1",
        parentId: "root",
        type: "text",
        title: "Chapter 1",
        content: `![r](http://127.0.0.1:${port}/x.png) ![c](unknown-slug)`,
        orderIndex: 0,
      }),
    ];
    const compiled = await BookManuscriptCompile(
      makeBook(),
      sections,
      MEDIA_ITEMS,
      makeLoader(),
    );
    const mdBlocks = flatten(compiled.chapters).filter(
      (b) => b.kind === "markdown",
    ) as Extract<CompiledBlock, { kind: "markdown" }>[];
    expect(mdBlocks[0].markdown).toContain("[missing image: r]");
    expect(mdBlocks[0].markdown).toContain("![c](unknown-slug)");
    expect(mdBlocks[0].markdown).not.toContain("127.0.0.1");
  });

  it("performs zero outbound requests for Markdown, DOCX and EPUB", async () => {
    hits = 0;
    const compiled = await BookManuscriptCompile(
      makeBook(),
      remoteSections(),
      MEDIA_ITEMS,
      makeLoader(),
      { include: "full" },
    );

    const markdown = RenderManuscriptMarkdown(compiled, makeBook());
    expect(markdown).toContain("[missing image: remote]");
    expect(markdown).toContain("[missing image: raw]");
    expect(markdown).toContain("[missing image: note]");
    expect(markdown).toContain("[missing image: cap]");
    expect(markdown).not.toContain("127.0.0.1");

    const docx = await RenderManuscriptDocx(compiled, makeBook());
    const documentXml = readZipEntry(docx, "word/document.xml").toString("utf8");
    expect(documentXml).toContain("missing image");
    expect(documentXml).not.toContain("127.0.0.1");
    expect(documentXml).not.toContain("remote-secret-bytes");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storywriter-ssrf-"));
    try {
      const epubFile = await RenderManuscriptEpub(compiled, makeBook(), tmpDir);
      const epub = await fs.readFile(epubFile);
      for (const entry of ["OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml"]) {
        const chapter = readZipEntry(epub, entry).toString("utf8");
        expect(chapter).toContain("missing image");
        expect(chapter).not.toContain("127.0.0.1");
        expect(chapter).not.toContain("remote-secret-bytes");
      }
    } finally {
      await fs.remove(tmpDir);
    }

    // Give any stray asynchronous fetch a chance to reach the listener
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hits).toBe(0);
  });
});
