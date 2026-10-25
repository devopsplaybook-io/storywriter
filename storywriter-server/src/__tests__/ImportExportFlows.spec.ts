import * as crypto from "crypto";
import * as fs from "fs-extra";
import { DbUtilsGetDatabase } from "@devopsplaybook.io/common-utils";
import { BookExportRun } from "../books/BookExport";
import { SectionsDataAdd } from "../sections/SectionsData";
import { Section } from "../model/Section";
import { Property } from "../model/Property";
import {
  PropertiesDataAdd,
  PropertiesDataSetSectionValue,
} from "../properties/PropertiesData";
import { RateLimitResetForTests } from "../utils/RateLimit";
import { BuildTarGz, MultipartFileBody, TestServer } from "./TestServer";

// A real 1x1 PNG (magic bytes must match the declared MIME type on upload).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function multipartInjectOptions(
  url: string,
  token: string,
  filename: string,
  content: Buffer,
  mimeType: string,
) {
  const { body, contentType } = MultipartFileBody(
    "file",
    filename,
    content,
    mimeType,
  );
  return {
    method: "POST" as const,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": contentType,
    },
    payload: body,
  };
}

describe("Import/export flows", () => {
  let server: TestServer;
  let admin: { id: string; token: string };
  let owner: { id: string; token: string };
  let outsider: { id: string; token: string };

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("ie-admin", "admin");
    owner = await server.createUser("ie-owner", "user", admin.token);
    outsider = await server.createUser("ie-outsider", "user", admin.token);
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  /** Create a book with a root, a text child and a media section. */
  async function seedBookWithChildAndMedia(name: string) {
    const book = await server.createBook(owner.token, name);
    const root = await server.getRootSection(owner.token, book.id);
    const created = await server.inject("POST", "/api/sections", owner.token, {
      bookId: book.id,
      parentId: root.id,
      type: "text",
      title: "Chapter One",
      content: "It was a dark and stormy night.",
    });
    const child = JSON.parse(created.body);
    const upload = await server.uploadMedia(
      owner.token,
      book.id,
      "dot.png",
      TINY_PNG,
      "image/png",
    );
    expect(upload.statusCode).toBe(201);
    const media = JSON.parse(upload.body);
    const mediaSectionRes = await server.inject(
      "POST",
      "/api/sections",
      owner.token,
      {
        bookId: book.id,
        parentId: root.id,
        type: "media",
        title: "A dot figure",
        mediaId: media.id,
        caption: "A dot",
      },
    );
    expect(mediaSectionRes.statusCode).toBe(201);
    return { book, root, child, media, mediaSection: JSON.parse(mediaSectionRes.body) };
  }

  it("exports a tar.gz and imports it back with sections and media intact", async () => {
    const { book, child } = await seedBookWithChildAndMedia("Roundtrip");

    const res = await server.inject(
      "GET",
      `/api/books/${book.id}/export`,
      owner.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/gzip");
    expect(res.headers["content-disposition"]).toContain(".tar.gz");
    expect(res.headers["x-filename"]).toContain(".tar.gz");
    expect(res.rawPayload.length).toBeGreaterThan(0);

    const importRes = await server.app.inject(
      multipartInjectOptions(
        "/api/books/import",
        owner.token,
        "roundtrip.tar.gz",
        res.rawPayload,
        "application/gzip",
      ),
    );
    expect(importRes.statusCode).toBe(201);
    const importedBook = JSON.parse(importRes.body);
    expect(importedBook.id).not.toBe(book.id);
    expect(importedBook.name).toBe("Roundtrip");

    const sectionsRes = await server.inject(
      "GET",
      `/api/sections?bookId=${importedBook.id}`,
      owner.token,
    );
    expect(sectionsRes.statusCode).toBe(200);
    const sections = JSON.parse(sectionsRes.body);
    const importedChild = sections.find((s) => s.title === "Chapter One");
    expect(importedChild).toBeDefined();
    expect(importedChild.content).toBe("It was a dark and stormy night.");
    expect(importedChild.id).not.toBe(child.id);
    const importedMediaSection = sections.find(
      (s) => s.title === "A dot figure",
    );
    expect(importedMediaSection).toBeDefined();
    expect(importedMediaSection.type).toBe("media");
    expect(importedMediaSection.mediaId).toBeTruthy();
    expect(importedMediaSection.caption).toBe("A dot");
  });

  it("exports markdown, docx and epub with the right headers", async () => {
    const { book } = await seedBookWithChildAndMedia("Formats");

    const md = await server.inject(
      "GET",
      `/api/books/${book.id}/export?format=markdown`,
      owner.token,
    );
    expect(md.statusCode).toBe(200);
    expect(md.headers["content-type"]).toContain("text/markdown");
    expect(md.headers["x-filename"]).toContain(".md");
    expect(md.rawPayload.toString("utf8")).toContain(
      "It was a dark and stormy night.",
    );

    const docx = await server.inject(
      "GET",
      `/api/books/${book.id}/export?format=docx`,
      owner.token,
    );
    expect(docx.statusCode).toBe(200);
    expect(docx.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docx.headers["x-filename"]).toContain(".docx");
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe("PK");

    const epub = await server.inject(
      "GET",
      `/api/books/${book.id}/export?format=epub`,
      owner.token,
    );
    expect(epub.statusCode).toBe(200);
    expect(epub.headers["content-type"]).toContain("application/epub+zip");
    expect(epub.headers["x-filename"]).toContain(".epub");
    expect(epub.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("rejects unknown formats and unauthorized users", async () => {
    const { book } = await seedBookWithChildAndMedia("Access");

    const badFormat = await server.inject(
      "GET",
      `/api/books/${book.id}/export?format=pdf`,
      owner.token,
    );
    expect(badFormat.statusCode).toBe(400);

    const denied = await server.inject(
      "GET",
      `/api/books/${book.id}/export`,
      outsider.token,
    );
    expect(denied.statusCode).toBe(403);
  });

  it("returns 413 when the content exceeds EXPORT_MAX_CONTENT_BYTES", async () => {
    const { book } = await seedBookWithChildAndMedia("Too big");
    const original = server.config.EXPORT_MAX_CONTENT_BYTES;
    server.config.EXPORT_MAX_CONTENT_BYTES = 10;
    try {
      const res = await server.inject(
        "GET",
        `/api/books/${book.id}/export?format=markdown`,
        owner.token,
      );
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toBe(
        "Book too large to export as markdown",
      );
    } finally {
      server.config.EXPORT_MAX_CONTENT_BYTES = original;
    }
  });

  it("returns 413 when the media exceeds EXPORT_MAX_TOTAL_MEDIA_BYTES", async () => {
    const { book } = await seedBookWithChildAndMedia("Media too big");
    const original = server.config.EXPORT_MAX_TOTAL_MEDIA_BYTES;
    server.config.EXPORT_MAX_TOTAL_MEDIA_BYTES = 1;
    try {
      const res = await server.inject(
        "GET",
        `/api/books/${book.id}/export?format=epub`,
        owner.token,
      );
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toBe("Book too large to export as epub");
    } finally {
      server.config.EXPORT_MAX_TOTAL_MEDIA_BYTES = original;
    }
  });

  it("rejects hostile archives with a 400 and imports nothing", async () => {
    // Path traversal entry
    const traversal = await BuildTarGz([
      { name: "manifest.json", content: JSON.stringify({ version: "2.0" }) },
      { name: "book.json", content: JSON.stringify({ name: "Evil" }) },
      { name: "sections.json", content: "[]" },
      { name: "../evil.txt", content: "gotcha" },
    ]);
    const traversalRes = await server.app.inject(
      multipartInjectOptions(
        "/api/books/import",
        owner.token,
        "traversal.tar.gz",
        traversal,
        "application/gzip",
      ),
    );
    expect(traversalRes.statusCode).toBe(400);
    expect(JSON.parse(traversalRes.body).error).toContain("Invalid archive");

    // Missing manifest
    const noManifest = await BuildTarGz([
      { name: "book.json", content: JSON.stringify({ name: "No manifest" }) },
      { name: "sections.json", content: "[]" },
    ]);
    const noManifestRes = await server.app.inject(
      multipartInjectOptions(
        "/api/books/import",
        owner.token,
        "nomanifest.tar.gz",
        noManifest,
        "application/gzip",
      ),
    );
    expect(noManifestRes.statusCode).toBe(400);

    // Not an archive at all
    const notArchive = await server.app.inject(
      multipartInjectOptions(
        "/api/books/import",
        owner.token,
        "junk.tar.gz",
        Buffer.from("this is not a tar.gz"),
        "application/gzip",
      ),
    );
    expect(notArchive.statusCode).toBe(400);

    // No book was created by any of the failed imports
    const books = await server.inject("GET", "/api/books", admin.token);
    const names = JSON.parse(books.body).map((b) => b.name);
    expect(names).not.toContain("Evil");
    expect(names).not.toContain("No manifest");
  });

  it("refuses an import larger than the multipart limit with 413", async () => {
    // Random bytes do not compress, so the archive itself exceeds the 10MB
    // multipart file limit configured in the test server.
    const big = await BuildTarGz([
      {
        name: "pad.bin",
        content: crypto.randomBytes(11 * 1024 * 1024),
      },
    ]);
    const res = await server.app.inject(
      multipartInjectOptions(
        "/api/books/import",
        owner.token,
        "big.tar.gz",
        big,
        "application/gzip",
      ),
    );
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toBe("Archive too large");
  });

  it("lists versions without snapshots but with size, and serves the snapshot separately", async () => {
    const { book, child } = await seedBookWithChildAndMedia("Versioned");

    const v1 = await server.inject(
      "POST",
      `/api/books/${book.id}/versions`,
      owner.token,
      { note: "first draft" },
    );
    expect(v1.statusCode).toBe(201);
    const v1Body = JSON.parse(v1.body);
    expect(v1Body.versionNumber).toBe(1);
    expect(v1Body.note).toBe("first draft");
    expect(v1Body.snapshot).toBeUndefined();

    await server.inject("PUT", `/api/sections/${child.id}`, owner.token, {
      content: "Rewritten second draft.",
    });
    const v2 = await server.inject(
      "POST",
      `/api/books/${book.id}/versions`,
      owner.token,
      { note: "second draft" },
    );
    expect(v2.statusCode).toBe(201);

    const list = await server.inject(
      "GET",
      `/api/books/${book.id}/versions`,
      owner.token,
    );
    expect(list.statusCode).toBe(200);
    const versions = JSON.parse(list.body);
    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(2);
    for (const version of versions) {
      expect(typeof version.size).toBe("number");
      expect(version.snapshot).toBeUndefined();
    }

    // Metadata endpoint: still no snapshot
    const meta = await server.inject(
      "GET",
      `/api/books/${book.id}/versions/${v1Body.id}`,
      owner.token,
    );
    expect(meta.statusCode).toBe(200);
    expect(JSON.parse(meta.body).snapshot).toBeUndefined();
    expect(JSON.parse(meta.body).note).toBe("first draft");

    // Snapshot endpoint: the v1 content
    const snap = await server.inject(
      "GET",
      `/api/books/${book.id}/versions/${v1Body.id}/snapshot`,
      owner.token,
    );
    expect(snap.statusCode).toBe(200);
    const snapshot = JSON.parse(JSON.parse(snap.body).snapshot);
    const snapChild = (snapshot.sections || []).find(
      (s) => s.title === "Chapter One",
    );
    expect(snapChild.content).toBe("It was a dark and stormy night.");

    // Restore v1: the section content reverts
    const restore = await server.inject(
      "POST",
      `/api/books/${book.id}/versions/${v1Body.id}/restore`,
      owner.token,
    );
    expect(restore.statusCode).toBe(200);
    const after = await server.inject(
      "GET",
      `/api/sections/${child.id}`,
      owner.token,
    );
    expect(JSON.parse(after.body).content).toBe(
      "It was a dark and stormy night.",
    );
  });

  it("exports 500 sections with a single property-values query (no N+1)", async () => {
    const book = await server.createBook(owner.token, "Perf book");
    const root = await server.getRootSection(owner.token, book.id);

    const property = new Property();
    property.bookId = book.id;
    property.name = "Label";
    await PropertiesDataAdd(property);

    for (let i = 0; i < 500; i++) {
      const section = new Section();
      section.bookId = book.id;
      section.parentId = root.id;
      section.type = "text";
      section.title = `Chapter ${i}`;
      section.content = `Content for chapter ${i}.`;
      section.orderIndex = i;
      await SectionsDataAdd(section);
      await PropertiesDataSetSectionValue(section.id, property.id, `L${i}`);
    }

    const db = DbUtilsGetDatabase() as any;
    const originalPrepare = db.prepare.bind(db);
    let total = 0;
    let sectionPropertyQueries = 0;
    db.prepare = (sql: string, ...args: unknown[]) => {
      total++;
      if (/section_properties/i.test(sql)) {
        sectionPropertyQueries++;
      }
      return originalPrepare(sql, ...args);
    };
    let tmpFile: string | null = null;
    try {
      tmpFile = await BookExportRun(book.id, server.config);
    } finally {
      db.prepare = originalPrepare;
      if (tmpFile) {
        await fs.remove(tmpFile).catch(() => undefined);
      }
    }

    // The old per-section pattern would issue 500+ section_properties
    // queries; the bulk loader needs one.
    expect(sectionPropertyQueries).toBeLessThanOrEqual(2);
    expect(total).toBeLessThan(30);
  }, 60_000);
});
