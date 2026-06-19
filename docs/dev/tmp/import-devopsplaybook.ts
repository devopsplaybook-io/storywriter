import { TarArchive } from "archiver";
import * as fs from "fs-extra";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

// ==================== Configuration ====================

const CONTENT_DIR =
  "/home/didier/Documents/Workspace/devopsplaybook.io/devopsplaybook-content";
const OUTPUT_FILE = "/tmp/devopsplaybook-import.tar.gz";
const API_BASE = "http://localhost:9006";
const API_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyZmI1NTQxOC0zMDBiLTRlMGMtYjBiNS0wMTM2ZWYwYzk1YmUiLCJ1c2VyTmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwidHlwZSI6ImFwaSIsImV4cCI6MjA5NzE5NTQyNCwiaWF0IjoxNzgxODM1NDI0fQ.xsoND6wGd2AX29H5AripvOrbDwhzcGiufkdcNAHas08";

// ==================== Types ====================

interface SectionData {
  id: string;
  bookId: string;
  parentId: string | null;
  type: string;
  title: string;
  content: string;
  analysis: string;
  mediaId: string | null;
  caption: string;
  orderIndex: number;
  version: number;
  dateCreated: string;
  dateUpdated: string;
}

interface PropertyData {
  id: string;
  bookId: string;
  name: string;
  type: string;
  options: string[];
}

interface SectionPropertyData {
  sectionId: string;
  propertyId: string;
  value: string;
}

interface MediaMeta {
  id: string;
  bookId: string;
  slug: string;
  filename: string;
  mimeType: string;
  size: number;
  dateCreated: string;
}

interface ParsedMd {
  frontmatter: Record<string, string>;
  content: string;
}

interface PremiumResult {
  regular: string;
  premiumBlocks: string[];
}

interface WalkResult {
  sections: SectionData[];
  premiumSectionIds: string[];
  mediaFiles: { mediaId: string; srcPath: string; filename: string }[];
}

// ==================== Helpers ====================

const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getMimeType(ext: string): string {
  return MIME_TYPES[ext] || "application/octet-stream";
}

function generateSlug(filename: string): string {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  return nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 150);
}

function parseMarkdown(filePath: string): ParsedMd {
  const raw = fs.readFileSync(filePath, "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: raw.trim() };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      frontmatter[key] = val;
    }
  }
  return { frontmatter, content: match[2].trim() };
}

function extractPremiumContent(content: string): PremiumResult {
  const regex = /\{% PremiumContent %\}([\s\S]*?)\{% endPremiumContent %\}/g;
  const blocks: string[] = [];
  let lastIndex = 0;
  const regularParts: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    regularParts.push(content.substring(lastIndex, match.index).trim());
    blocks.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  regularParts.push(content.substring(lastIndex).trim());
  return {
    regular: regularParts.filter(Boolean).join("\n\n"),
    premiumBlocks: blocks.filter((b) => b.length > 0),
  };
}

function makeSection(
  bookId: string,
  parentId: string | null,
  type: string,
  title: string,
  content: string,
  orderIndex: number,
): SectionData {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    bookId,
    parentId,
    type,
    title,
    content,
    analysis: "",
    mediaId: null,
    caption: "",
    orderIndex,
    version: 1,
    dateCreated: now,
    dateUpdated: now,
  };
}

// Should skip internal directories/files
function isIgnored(name: string): boolean {
  return (
    name.startsWith(".") || name.startsWith("_") || name === "node_modules"
  );
}

// ==================== Directory Walk ====================

function walkDirectory(
  dirPath: string,
  parentSectionId: string | null,
  bookId: string,
  isRootLevel: boolean,
): WalkResult {
  const result: WalkResult = {
    sections: [],
    premiumSectionIds: [],
    mediaFiles: [],
  };

  const entries = fs.readdirSync(dirPath).filter((e) => !isIgnored(e));

  // Separate index.md from other entries
  const hasIndexMd = entries.includes("index.md");
  const subDirs = entries.filter((e) =>
    fs.statSync(path.join(dirPath, e)).isDirectory(),
  );
  const mdFiles = entries.filter(
    (e) =>
      e.endsWith(".md") &&
      e !== "index.md" &&
      e !== "README.md" &&
      fs.statSync(path.join(dirPath, e)).isFile(),
  );
  const mediaFiles = entries.filter((e) => {
    if (e.startsWith(".")) return false;
    const ext = path.extname(e).toLowerCase();
    return ext in MIME_TYPES;
  });

  // Determine the section for this directory
  let dirSectionId: string | null = null;

  if (isRootLevel) {
    // At the root level, we don't create a wrapper section.
    // Each top-level entry becomes a direct child of the root section.
    dirSectionId = parentSectionId;
  } else if (hasIndexMd) {
    const indexMdPath = path.join(dirPath, "index.md");
    const { frontmatter, content } = parseMarkdown(indexMdPath);
    const { regular, premiumBlocks } = extractPremiumContent(content);
    const title = frontmatter.title || capitalize(path.basename(dirPath));
    const order = parseInt(frontmatter.order) || 0;

    const hasChildDirs = subDirs.length > 0;
    const hasChildFiles = mdFiles.length > 0;

    if (hasChildDirs || hasChildFiles) {
      // Container section (no content - it groups children)
      const container = makeSection(
        bookId,
        parentSectionId,
        "container",
        title,
        "",
        order,
      );
      result.sections.push(container);
      dirSectionId = container.id;

      // Create a child text section for the content of index.md
      if (regular) {
        const contentSection = makeSection(
          bookId,
          dirSectionId,
          "text",
          title,
          regular,
          0,
        );
        result.sections.push(contentSection);
      }

      // Handle premium blocks as child sections of the container
      for (let i = 0; i < premiumBlocks.length; i++) {
        const premiumSection = makeSection(
          bookId,
          dirSectionId,
          "text",
          `${title} (Premium${premiumBlocks.length > 1 ? ` ${i + 1}` : ""})`,
          premiumBlocks[i],
          999 + i,
        );
        result.sections.push(premiumSection);
        result.premiumSectionIds.push(premiumSection.id);
      }
    } else {
      // Leaf text section
      const section = makeSection(
        bookId,
        parentSectionId,
        "text",
        title,
        regular,
        order,
      );
      result.sections.push(section);
      dirSectionId = section.id;

      // Handle premium blocks as child sections
      for (let i = 0; i < premiumBlocks.length; i++) {
        const premiumSection = makeSection(
          bookId,
          dirSectionId,
          "text",
          `${title} (Premium${premiumBlocks.length > 1 ? ` ${i + 1}` : ""})`,
          premiumBlocks[i],
          999 + i,
        );
        result.sections.push(premiumSection);
        result.premiumSectionIds.push(premiumSection.id);
      }
    }
  } else {
    // No index.md — grouping directory (e.g., inventory/*)
    const title = capitalize(path.basename(dirPath));
    const container = makeSection(
      bookId,
      parentSectionId,
      "container",
      title,
      "",
      0,
    );
    result.sections.push(container);
    dirSectionId = container.id;
  }

  // Process media files in this directory
  for (const file of mediaFiles) {
    const filePath = path.join(dirPath, file);
    const ext = path.extname(file).toLowerCase();
    const stats = fs.statSync(filePath);
    const mediaId = uuidv4();
    result.mediaFiles.push({ mediaId, srcPath: filePath, filename: file });
  }

  // Process child directories (sorted)
  const sortedDirs = subDirs.slice().sort((a, b) => {
    const orderA = getOrderFromIndexMd(path.join(dirPath, a, "index.md"));
    const orderB = getOrderFromIndexMd(path.join(dirPath, b, "index.md"));
    if (orderA !== null && orderB !== null) return orderA - orderB;
    if (orderA !== null) return -1;
    if (orderB !== null) return 1;
    return a.localeCompare(b);
  });

  for (const subDir of sortedDirs) {
    const childResult = walkDirectory(
      path.join(dirPath, subDir),
      dirSectionId || parentSectionId,
      bookId,
      false,
    );
    result.sections.push(...childResult.sections);
    result.premiumSectionIds.push(...childResult.premiumSectionIds);
    result.mediaFiles.push(...childResult.mediaFiles);
  }

  // Process non-index markdown files directly in this directory
  const sortedMdFiles = mdFiles.slice().sort((a, b) => {
    const orderA = getOrderFromIndexMd(path.join(dirPath, a));
    const orderB = getOrderFromIndexMd(path.join(dirPath, b));
    if (orderA !== null && orderB !== null) return orderA - orderB;
    if (orderA !== null) return -1;
    if (orderB !== null) return 1;
    return a.localeCompare(b);
  });

  for (const mdFile of sortedMdFiles) {
    const filePath = path.join(dirPath, mdFile);
    const { frontmatter, content } = parseMarkdown(filePath);
    const { regular, premiumBlocks } = extractPremiumContent(content);
    const title = frontmatter.title || capitalize(path.basename(mdFile, ".md"));

    const section = makeSection(
      bookId,
      dirSectionId || parentSectionId,
      "text",
      title,
      regular,
      0,
    );
    result.sections.push(section);

    // Handle premium blocks as child sections
    for (let i = 0; i < premiumBlocks.length; i++) {
      const premiumSection = makeSection(
        bookId,
        section.id,
        "text",
        `${title} (Premium${premiumBlocks.length > 1 ? ` ${i + 1}` : ""})`,
        premiumBlocks[i],
        999 + i,
      );
      result.sections.push(premiumSection);
      result.premiumSectionIds.push(premiumSection.id);
    }
  }

  return result;
}

function getOrderFromIndexMd(indexPath: string): number | null {
  try {
    if (fs.existsSync(indexPath)) {
      const { frontmatter } = parseMarkdown(indexPath);
      if (frontmatter.order) return parseInt(frontmatter.order);
    }
  } catch {
    // ignore
  }
  return null;
}

function capitalize(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ==================== Main ====================

async function main() {
  console.log("=== DevOpsPlaybook Import Script ===\n");

  const bookId = uuidv4();
  const now = new Date().toISOString();

  // --- Create root section ---
  const rootSectionId = uuidv4();
  const rootSection: SectionData = {
    id: rootSectionId,
    bookId,
    parentId: null,
    type: "container",
    title: "Root",
    content: "",
    analysis: "",
    mediaId: null,
    caption: "",
    orderIndex: 0,
    version: 1,
    dateCreated: now,
    dateUpdated: now,
  };

  // --- Walk the content directory ---
  console.log("Walking content directory...");
  const walkResult = walkDirectory(CONTENT_DIR, rootSectionId, bookId, true);

  console.log(`  Sections created: ${walkResult.sections.length + 1}`);
  console.log(`  Premium sections: ${walkResult.premiumSectionIds.length}`);
  console.log(`  Media files found: ${walkResult.mediaFiles.length}`);

  // --- Create properties ---
  const sectionTypesPropId = uuidv4();
  const properties: PropertyData[] = [
    {
      id: sectionTypesPropId,
      bookId,
      name: "Section Types",
      type: "section-type",
      options: ["Chapter", "Premium Content"],
    },
  ];

  console.log(`  Properties: ${properties.length}`);

  // --- Create section property mappings for premium sections ---
  const sectionProperties: SectionPropertyData[] =
    walkResult.premiumSectionIds.map((sectionId) => ({
      sectionId,
      propertyId: sectionTypesPropId,
      value: "Premium Content",
    }));

  console.log(`  Section-property mappings: ${sectionProperties.length}`);

  // --- Create media metadata ---
  const mediaItems: MediaMeta[] = [];
  const mediaToCopy: { mediaId: string; srcPath: string; destName: string }[] =
    [];

  for (const mf of walkResult.mediaFiles) {
    const slug = generateSlug(mf.filename);
    const ext = path.extname(mf.filename).toLowerCase();
    const meta: MediaMeta = {
      id: mf.mediaId,
      bookId,
      slug,
      filename: mf.filename,
      mimeType: getMimeType(ext),
      size: fs.statSync(mf.srcPath).size,
      dateCreated: now,
    };
    mediaItems.push(meta);
    mediaToCopy.push({
      mediaId: mf.mediaId,
      srcPath: mf.srcPath,
      destName: mf.filename,
    });
  }

  console.log(`  Media metadata entries: ${mediaItems.length}`);

  // --- Build book data ---
  const bookData = {
    name: "DevOpsPlaybook",
    description:
      "A comprehensive guide to DevOps practices, principles, and implementation.",
    dateCreated: now,
    dateUpdated: now,
  };

  const manifest = {
    version: "1.0",
    exportedAt: now,
    bookName: "DevOpsPlaybook",
  };

  // --- Build all sections array (root first, then children) ---
  const allSections: SectionData[] = [rootSection, ...walkResult.sections];

  // --- Serialize to JSON ---
  const jsonData: Record<string, string> = {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "book.json": JSON.stringify(bookData, null, 2),
    "sections.json": JSON.stringify(allSections, null, 2),
    "section-versions.json": "[]",
    "attributes.json": "[]",
    "attribute-versions.json": "[]",
    "properties.json": JSON.stringify(properties, null, 2),
    "section-properties.json": JSON.stringify(sectionProperties, null, 2),
    "media-metadata.json": JSON.stringify(mediaItems, null, 2),
  };

  // --- Create tar.gz archive ---
  console.log("\nCreating tar.gz archive...");

  const archive = new TarArchive({
    gzip: true,
    gzipOptions: { level: 6 },
  });

  archive.on("error", (err: Error) => {
    throw err;
  });

  // Add JSON files
  for (const [name, data] of Object.entries(jsonData)) {
    archive.append(data, { name });
  }

  // Add media files
  for (const mc of mediaToCopy) {
    archive.file(mc.srcPath, { name: `media/${mc.mediaId}/${mc.destName}` });
  }

  // Write to file
  const writeStream = fs.createWriteStream(OUTPUT_FILE);
  archive.pipe(writeStream);

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    archive.on("error", reject);
    archive.finalize();
  });

  const archiveSize = fs.statSync(OUTPUT_FILE).size;
  console.log(
    `  Archive written: ${OUTPUT_FILE} (${(archiveSize / 1024 / 1024).toFixed(2)} MB)`,
  );

  // --- Upload via API ---
  console.log("\nUploading to API...");

  const boundary = "----" + uuidv4().replace(/-/g, "");
  const archiveBuffer = fs.readFileSync(OUTPUT_FILE);
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="devopsplaybook.tar.gz"\r\n` +
    `Content-Type: application/gzip\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(header, "utf-8"),
    archiveBuffer,
    Buffer.from(footer, "utf-8"),
  ]);

  const response = await fetch(`${API_BASE}/api/books/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Import failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`  Import successful! Book ID: ${result.id}`);
  console.log(`  Book: ${result.name}`);

  console.log("\n=== Import Complete ===");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
