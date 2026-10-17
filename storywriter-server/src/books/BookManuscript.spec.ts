import { Book } from "../model/Book";
import { Section } from "../model/Section";
import * as zlib from "zlib";
import {
  BookManuscriptCompile,
  CompiledBlock,
  ManuscriptMediaRef,
  MediaFileLoader,
  RenderManuscriptDocx,
  RenderManuscriptEpub,
  RenderManuscriptMarkdown,
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
  it("returns a non-empty Buffer with zip magic and a stored mimetype first entry", async () => {
    const compiled = await BookManuscriptCompile(
      makeBook(),
      makeSections(),
      MEDIA_ITEMS,
      makeLoader(),
    );
    const buffer = await RenderManuscriptEpub(compiled, makeBook());
    expect(Buffer.isBuffer(buffer)).toBe(true);
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
    const buffer = await RenderManuscriptEpub(compiled, makeBook());
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
