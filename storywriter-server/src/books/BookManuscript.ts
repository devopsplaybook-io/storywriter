import { ZipArchive } from "archiver";
import * as fs from "fs-extra";
import { marked } from "marked";
import HTMLtoDOCX from "@turbodocx/html-to-docx";
import { v4 as uuidv4 } from "uuid";
import { Book } from "../model/Book";
import { Section } from "../model/Section";

export type ManuscriptInclude = "content" | "full";

/**
 * Thrown when the book exceeds the configured manuscript export budgets
 * (content or media size); routes map it to a 413 response.
 */
export class ManuscriptTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManuscriptTooLargeError";
  }
}

export interface ManuscriptOptions {
  include?: ManuscriptInclude;
}

export interface ManuscriptMediaRef {
  id: string;
  slug: string;
  filename: string;
  mimeType: string;
}

export interface ManuscriptMediaFile {
  buffer: Buffer;
  mimeType: string;
}

export type MediaFileLoader = (
  bookId: string,
  mediaId: string,
  filename: string,
) => Promise<ManuscriptMediaFile | null>;

export interface CompiledContentImage {
  token: string;
  alt: string;
  media: ManuscriptMediaFile | null;
  missingLabel: string;
}

export type CompiledBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "markdown"; markdown: string; images: CompiledContentImage[] }
  | {
      kind: "image";
      alt: string;
      caption: string | null;
      media: ManuscriptMediaFile | null;
      missingLabel: string;
    };

export interface CompiledBook {
  chapters: CompiledBlock[][];
}

const CONTENT_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// Pure compile+render module kept free of DB imports so it stays unit-testable

export function resolveMediaSlug(
  mediaItems: ManuscriptMediaRef[],
  href: string,
): ManuscriptMediaRef | null {
  const slug = href.replace(/\.[^/.]+$/, "");
  return (
    mediaItems.find((m) => m.slug === slug) ||
    mediaItems.find((m) => m.slug === href) ||
    null
  );
}

export async function BookManuscriptCompile(
  book: Book,
  sections: Section[],
  mediaItems: ManuscriptMediaRef[],
  loadMediaFile: MediaFileLoader,
  options: ManuscriptOptions = {},
  sectionLabels: Record<string, string[]> = {},
): Promise<CompiledBook> {
  const include: ManuscriptInclude =
    options.include === "full" ? "full" : "content";

  const byParent = new Map<string | null, Section[]>();
  for (const section of sections) {
    const key = section.parentId || null;
    const list = byParent.get(key) || [];
    list.push(section);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
  }
  const siblings = (parentId: string | null) => byParent.get(parentId) || [];

  const tokenByMediaId = new Map<string, CompiledContentImage>();
  let tokenCounter = 0;

  const loadRef = async (
    ref: ManuscriptMediaRef,
  ): Promise<{ media: ManuscriptMediaFile | null; missingLabel: string }> => {
    const file = await loadMediaFile(book.id, ref.id, ref.filename);
    return {
      media: file,
      missingLabel: `[missing image: ${ref.slug || ref.id}]`,
    };
  };

  const resolveContentImages = async (
    content: string,
  ): Promise<{ markdown: string; images: CompiledContentImage[] }> => {
    if (!content) {
      return { markdown: "", images: [] };
    }
    const matches = [...content.matchAll(CONTENT_IMAGE_RE)];
    for (const match of matches) {
      const href = match[2];
      if (/^(https?:\/\/|data:)/i.test(href)) {
        continue;
      }
      const ref = resolveMediaSlug(mediaItems, href);
      if (!ref || tokenByMediaId.has(ref.id)) {
        continue;
      }
      const { media, missingLabel } = await loadRef(ref);
      tokenByMediaId.set(ref.id, {
        token: `{{storywriter-media:${tokenCounter++}}}`,
        alt: match[1],
        media,
        missingLabel,
      });
    }
    const used = new Map<string, CompiledContentImage>();
    const markdown = content.replace(
      CONTENT_IMAGE_RE,
      (match, _alt: string, href: string) => {
        if (/^(https?:\/\/|data:)/i.test(href)) {
          return match;
        }
        const ref = resolveMediaSlug(mediaItems, href);
        if (!ref) {
          return match;
        }
        const entry = tokenByMediaId.get(ref.id);
        if (!entry) {
          return match;
        }
        used.set(ref.id, entry);
        return entry.token;
      },
    );
    return { markdown, images: [...used.values()] };
  };

  const walk = async (
    section: Section,
    depth: number,
  ): Promise<CompiledBlock[]> => {
    const blocks: CompiledBlock[] = [];
    blocks.push({
      kind: "heading",
      level: Math.min(depth, 6),
      text: section.title || "Untitled",
    });
    if (include === "full") {
      const labels = sectionLabels[section.id] || [];
      if (labels.length > 0) {
        blocks.push({
          kind: "markdown",
          markdown: `*Labels: ${labels.join(", ")}*`,
          images: [],
        });
      }
    }
    if (section.type === "media") {
      const ref = mediaItems.find((m) => m.id === section.mediaId) || null;
      const { media, missingLabel } = ref
        ? await loadRef(ref)
        : {
            media: null,
            missingLabel: `[missing image: ${section.mediaId || section.id}]`,
          };
      blocks.push({
        kind: "image",
        alt: section.title || "",
        caption: section.caption || null,
        media,
        missingLabel,
      });
    } else if (section.type === "text") {
      const { markdown, images } = await resolveContentImages(
        section.content || "",
      );
      blocks.push({ kind: "markdown", markdown, images });
      if (include === "full" && (section.analysis || "").trim()) {
        blocks.push({
          kind: "heading",
          level: Math.min(depth + 1, 6),
          text: "AI Notes",
        });
        blocks.push({ kind: "markdown", markdown: section.analysis, images: [] });
      }
    }
    for (const child of siblings(section.id)) {
      blocks.push(...(await walk(child, depth + 1)));
    }
    return blocks;
  };

  const chapters: CompiledBlock[][] = [];
  const roots = siblings(null);
  if (roots.length === 1) {
    for (const child of siblings(roots[0].id)) {
      chapters.push(await walk(child, 1));
    }
  } else {
    for (const root of roots) {
      chapters.push(await walk(root, 1));
    }
  }
  return { chapters };
}

function cleanAlt(alt: string): string {
  return (alt || "").replace(/[[\]\n]/g, " ").trim();
}

function yamlString(value: string): string {
  return `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")}"`;
}

function substituteImages(
  block: { markdown: string; images: CompiledContentImage[] },
  renderImage: (image: CompiledContentImage) => string,
): string {
  let markdown = block.markdown;
  for (const image of block.images) {
    markdown = markdown.split(image.token).join(renderImage(image));
  }
  return markdown;
}

function toDataUri(media: ManuscriptMediaFile): string {
  return `data:${media.mimeType};base64,${media.buffer.toString("base64")}`;
}

function flatten(compiled: CompiledBook): CompiledBlock[] {
  return compiled.chapters.flat();
}

export function RenderManuscriptMarkdown(
  compiled: CompiledBook,
  book: Book,
): string {
  const lines: string[] = ["---", `title: ${yamlString(book.name)}`];
  if (book.description) {
    lines.push(`description: ${yamlString(book.description)}`);
  }
  lines.push("---", "");
  for (const block of flatten(compiled)) {
    if (block.kind === "heading") {
      lines.push(`${"#".repeat(block.level)} ${block.text}`, "");
    } else if (block.kind === "markdown") {
      lines.push(
        substituteImages(block, (image) =>
          image.media
            ? `![${cleanAlt(image.alt)}](${toDataUri(image.media)})`
            : image.missingLabel,
        ),
        "",
      );
    } else {
      if (block.media) {
        lines.push(`![${cleanAlt(block.alt)}](${toDataUri(block.media)})`, "");
      } else {
        lines.push(block.missingLabel, "");
      }
      if (block.caption) {
        lines.push(block.caption, "");
      }
    }
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function escapeXml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// marked emits HTML void elements without a slash; XHTML (EPUB) needs them self-closed
function toXhtml(html: string): string {
  return html.replace(/<(br|hr|img)\b([^>]*?)\s*\/?>/gi, "<$1$2 />");
}

function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return "";
  }
  const html = marked.parse(markdown, { breaks: true, async: false }) as string;
  return toXhtml(html).trim();
}

function blockToHtml(
  block: CompiledBlock,
  renderImage: (image: CompiledContentImage) => string,
  renderSectionImage: (block: Extract<CompiledBlock, { kind: "image" }>) => string,
): string {
  if (block.kind === "heading") {
    return `<h${block.level}>${escapeXml(block.text)}</h${block.level}>`;
  }
  if (block.kind === "markdown") {
    return markdownToHtml(substituteImages(block, renderImage));
  }
  const image = renderSectionImage(block);
  let html = `<p>${image}</p>`;
  if (block.caption) {
    html += `\n<div class="media-caption">${markdownToHtml(block.caption)}</div>`;
  }
  return html;
}

export async function RenderManuscriptDocx(
  compiled: CompiledBook,
  book: Book,
): Promise<Buffer> {
  const body = flatten(compiled)
    .map((block) =>
      blockToHtml(
        block,
        (image) =>
          image.media
            ? `<img src="${toDataUri(image.media)}" alt="${escapeXml(cleanAlt(image.alt))}" />`
            : escapeXml(image.missingLabel),
        (imageBlock) =>
          imageBlock.media
            ? `<img src="${toDataUri(imageBlock.media)}" alt="${escapeXml(cleanAlt(imageBlock.alt))}" />`
            : escapeXml(imageBlock.missingLabel),
      ),
    )
    .join("\n");
  const html = `<html><head></head><body>${body}</body></html>`;
  const result = await HTMLtoDOCX(html, null, {
    title: book.name,
    description: book.description || undefined,
  });
  return Buffer.isBuffer(result)
    ? result
    : Buffer.from(result as unknown as ArrayBuffer);
}

function extForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/bmp": "bmp",
  };
  return map[mimeType] || "bin";
}

/**
 * Render the EPUB into `<tmpDir>/epub-<uuid>.epub` and resolve with its path.
 * The archive is written to disk instead of being collected in memory (books
 * with large media would otherwise be buffered twice over); the caller
 * streams the file and is responsible for unlinking it.
 */
export async function RenderManuscriptEpub(
  compiled: CompiledBook,
  book: Book,
  tmpDir: string,
): Promise<string> {
  const blocks = flatten(compiled);

  const epubImages: { path: string; media: ManuscriptMediaFile }[] = [];
  const pathByToken = new Map<string, string>();
  const pathByImageBlock = new Map<object, string>();
  let imageCounter = 0;
  const registerImage = (media: ManuscriptMediaFile): string => {
    const imagePath = `media/img-${++imageCounter}.${extForMimeType(media.mimeType)}`;
    epubImages.push({ path: imagePath, media });
    return imagePath;
  };
  for (const block of blocks) {
    if (block.kind === "markdown") {
      for (const image of block.images) {
        if (image.media) {
          pathByToken.set(image.token, registerImage(image.media));
        }
      }
    } else if (block.kind === "image" && block.media) {
      pathByImageBlock.set(block, registerImage(block.media));
    }
  }

  const chapterTitles = compiled.chapters.map((chapterBlocks) => {
    const heading = chapterBlocks.find((b) => b.kind === "heading");
    return heading && heading.kind === "heading"
      ? heading.text
      : "Untitled";
  });

  const chapterHtml = compiled.chapters.map((chapterBlocks, index) => {
    const title = chapterTitles[index];
    const body = chapterBlocks
      .map((block) =>
        blockToHtml(
          block,
          (image) =>
            image.media
              ? `<img src="${pathByToken.get(image.token)}" alt="${escapeXml(cleanAlt(image.alt))}" />`
              : escapeXml(image.missingLabel),
          (imageBlock) =>
            imageBlock.media
              ? `<img src="${pathByImageBlock.get(imageBlock)}" alt="${escapeXml(cleanAlt(imageBlock.alt))}" />`
              : escapeXml(imageBlock.missingLabel),
        ),
      )
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="und" xml:lang="und">
<head>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>`;
  });

  const navHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="und" xml:lang="und">
<head>
<title>Contents</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${chapterTitles
  .map(
    (title, index) =>
      `<li><a href="ch${index + 1}.xhtml">${escapeXml(title)}</a></li>`,
  )
  .join("\n")}
</ol>
</nav>
</body>
</html>`;

  const uid = `urn:uuid:${book.id}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const opfManifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...chapterHtml.map(
      (_, index) =>
        `<item id="ch${index + 1}" href="ch${index + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
    ...epubImages.map(
      (image, index) =>
        `<item id="img${index + 1}" href="${image.path}" media-type="${escapeXml(image.media.mimeType)}"/>`,
    ),
  ].join("\n");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="und">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(uid)}</dc:identifier>
    <dc:title>${escapeXml(book.name)}</dc:title>
    <dc:language>und</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${opfManifest}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav"/>
${chapterHtml
  .map((_, index) => `    <itemref idref="ch${index + 1}"/>`)
  .join("\n")}
  </spine>
</package>`;

  const ncxNavPoints = chapterTitles
    .map(
      (title, index) =>
        `    <navPoint id="np${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="ch${index + 1}.xhtml"/>
    </navPoint>`,
    )
    .join("\n");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(book.name)}</text></docTitle>
  <navMap>
${ncxNavPoints}
  </navMap>
</ncx>`;

  const css = `body { font-family: serif; line-height: 1.6; margin: 1em; }
h1, h2, h3, h4, h5, h6 { font-family: sans-serif; line-height: 1.3; }
img { max-width: 100%; }
.media-caption { font-style: italic; color: #555; text-align: center; }
`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  await fs.ensureDir(tmpDir);
  const tmpFile = `${tmpDir}/epub-${uuidv4()}.epub`;
  const output = fs.createWriteStream(tmpFile);

  const archive = new ZipArchive();
  const finished = new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      archive.destroy();
      output.destroy();
      reject(err);
    };
    archive.on("error", fail);
    output.on("error", fail);
    output.on("close", () => resolve());
  });

  archive.pipe(output);

  try {
    // EPUB requires the mimetype entry first and stored uncompressed
    archive.append(Buffer.from("application/epub+zip"), {
      name: "mimetype",
      store: true,
    });
    archive.append(containerXml, { name: "META-INF/container.xml" });
    archive.append(opf, { name: "OEBPS/content.opf" });
    archive.append(navHtml, { name: "OEBPS/nav.xhtml" });
    archive.append(ncx, { name: "OEBPS/toc.ncx" });
    archive.append(css, { name: "OEBPS/style.css" });
    chapterHtml.forEach((html, index) => {
      archive.append(html, { name: `OEBPS/ch${index + 1}.xhtml` });
    });
    for (const image of epubImages) {
      archive.append(image.media.buffer, {
        name: `OEBPS/${image.path}`,
      });
    }
    await Promise.all([archive.finalize(), finished]);
    return tmpFile;
  } catch (err) {
    archive.destroy();
    output.destroy();
    await fs.remove(tmpFile).catch(() => undefined);
    throw err;
  }
}
