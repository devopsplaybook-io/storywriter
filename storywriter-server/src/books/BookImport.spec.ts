import * as fs from "fs-extra";
import * as path from "path";
import {
  BuildTarGz,
  MultipartFileBody,
  TestServer,
  TestUser,
} from "../__tests__/TestServer";

// Wrap SectionsDataAdd in a jest.fn so the atomicity test can force a
// failure (swc's getter-based exports cannot be spied on directly).
jest.mock("../sections/SectionsData", () => {
  const actual = jest.requireActual("../sections/SectionsData");
  return {
    ...actual,
    SectionsDataAdd: jest.fn(actual.SectionsDataAdd),
  };
});

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);

interface ArchiveOptions {
  version?: string;
  bookName?: string;
  sections?: Record<string, unknown>[];
  attributes?: Record<string, unknown>[];
  properties?: Record<string, unknown>[];
  sectionProperties?: Record<string, unknown>[];
  mediaMetadata?: Record<string, unknown>[];
  mediaFiles?: { name: string; content: Buffer }[];
  includeLegacyFiles?: boolean;
  omit?: string[];
}

function ArchiveFiles(options: ArchiveOptions = {}): {
  name: string;
  content: Buffer | string;
}[] {
  const manifest = {
    version: options.version ?? "2.0",
    exportedAt: "2026-01-01T00:00:00.000Z",
    bookName: options.bookName ?? "Imported Book",
  };
  const book = {
    name: options.bookName ?? "Imported Book",
    description: "A book for tests",
    dateCreated: "2026-01-01T00:00:00.000Z",
    writingGoal: 1000,
  };
  const sections = options.sections ?? [
    {
      id: "root-1",
      bookId: "old-book",
      parentId: null,
      type: "container",
      title: "Root",
      content: "",
      analysis: "",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      dateCreated: "2026-01-01T00:00:00.000Z",
      dateUpdated: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "sec-1",
      bookId: "old-book",
      parentId: "root-1",
      type: "text",
      title: "Chapter 1",
      content: "Once upon a time",
      analysis: "The AI notes for chapter 1",
      mediaId: null,
      caption: "",
      orderIndex: 0,
      dateCreated: "2026-01-01T00:00:00.000Z",
      dateUpdated: "2026-01-01T00:00:00.000Z",
    },
  ];
  const files: { name: string; content: Buffer | string }[] = [
    { name: "manifest.json", content: JSON.stringify(manifest) },
    { name: "book.json", content: JSON.stringify(book) },
    { name: "sections.json", content: JSON.stringify(sections) },
    {
      name: "attributes.json",
      content: JSON.stringify(options.attributes ?? []),
    },
    {
      name: "properties.json",
      content: JSON.stringify(options.properties ?? []),
    },
    {
      name: "section-properties.json",
      content: JSON.stringify(options.sectionProperties ?? []),
    },
    {
      name: "media-metadata.json",
      content: JSON.stringify(options.mediaMetadata ?? []),
    },
    ...(options.includeLegacyFiles
      ? [
          { name: "section-versions.json", content: "[]" },
          { name: "attribute-versions.json", content: "[]" },
        ]
      : []),
    ...(options.mediaFiles ?? []),
  ];
  return files.filter((f) => !(options.omit || []).includes(f.name));
}

async function ImportArchive(
  server: TestServer,
  token: string,
  archive: Buffer,
) {
  const { body, contentType } = MultipartFileBody(
    "file",
    "book.tar.gz",
    archive,
    "application/gzip",
  );
  return server.app.inject({
    method: "POST",
    url: "/api/books/import",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
}

function ListTempImportDirs(server: TestServer): string[] {
  return fs
    .readdirSync(server.config.TMP_DIR)
    .filter((name) => name.startsWith("import-"));
}

describe("Book import", () => {
  let server: TestServer;
  let user: TestUser;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    const admin = await server.createUser("admin");
    user = await server.createUser("importer", "user", admin.token);
  });

  afterAll(async () => {
    await server.close();
  });

  it("imports a valid 2.0 archive and preserves content, AI notes, properties and media", async () => {
    // Source book built through the API so the archive matches real exports.
    const source = await server.createBook(user.token, "Roundtrip Source");
    const root = await server.getRootSection(user.token, source.id);
    const sectionRes = await server.inject("POST", "/api/sections", user.token, {
      bookId: source.id,
      parentId: root.id,
      title: "Chapter 1",
      content: "Once upon a time",
    });
    expect(sectionRes.statusCode).toBe(201);
    const section = JSON.parse(sectionRes.body);
    await server.inject(
      "PUT",
      `/api/sections/${section.id}`,
      user.token,
      { analysis: "The AI notes for chapter 1" },
    );
    const mediaRes = await server.uploadMedia(
      user.token,
      source.id,
      "my picture.png",
      PNG_BYTES,
      "image/png",
    );
    expect(mediaRes.statusCode).toBe(201);
    // createBook seeds a default "Section Types" property — reuse it.
    const propsSourceRes = await server.inject(
      "GET",
      `/api/properties?bookId=${source.id}`,
      user.token,
    );
    const property = JSON.parse(propsSourceRes.body)[0];
    await server.inject(
      "PUT",
      `/api/properties/section/${section.id}`,
      user.token,
      { propertyId: property.id, value: "Chapter" },
    );
    await server.inject("POST", "/api/book-attributes", user.token, {
      bookId: source.id,
      title: "Main Character",
      content: "AIDA — the protagonist",
    });

    const exportRes = await server.inject(
      "GET",
      `/api/books/${source.id}/export?format=targz`,
      user.token,
    );
    expect(exportRes.statusCode).toBe(200);

    const importRes = await ImportArchive(
      server,
      user.token,
      exportRes.rawPayload,
    );
    expect(importRes.statusCode).toBe(201);
    const imported = JSON.parse(importRes.body);
    expect(imported.id).not.toBe(source.id);
    expect(imported.name).toBe("Roundtrip Source");
    expect(imported.ownerId).toBe(user.id);

    // The importing user owns the book and holds a write access row.
    const accessRes = await server.inject(
      "GET",
      `/api/books/${imported.id}/access`,
      user.token,
    );
    expect(accessRes.statusCode).toBe(200);
    const access = JSON.parse(accessRes.body);
    expect(access).toEqual([
      { bookId: imported.id, userId: user.id, permission: "write" },
    ]);

    // Sections, content and AI notes
    const sectionsRes = await server.inject(
      "GET",
      `/api/sections?bookId=${imported.id}`,
      user.token,
    );
    const importedSections = JSON.parse(sectionsRes.body);
    const importedChapter = importedSections.find(
      (s: any) => s.title === "Chapter 1",
    );
    expect(importedChapter).toBeDefined();
    expect(importedChapter.content).toBe("Once upon a time");
    expect(importedChapter.analysis).toBe("The AI notes for chapter 1");

    // Media: metadata preserved, bytes identical, server-generated filename
    const mediaListRes = await server.inject(
      "GET",
      `/api/books/${imported.id}/media`,
      user.token,
    );
    const importedMedia = JSON.parse(mediaListRes.body);
    expect(importedMedia).toHaveLength(1);
    expect(importedMedia[0].originalFilename).toBe("my picture.png");
    expect(importedMedia[0].mimeType).toBe("image/png");
    expect(importedMedia[0].filename).toMatch(
      new RegExp(`^${importedMedia[0].id}\\.png$`),
    );
    const fileRes = await server.inject(
      "GET",
      `/api/books/${imported.id}/media/${importedMedia[0].id}/file`,
      user.token,
    );
    expect(fileRes.statusCode).toBe(200);
    expect(Buffer.compare(fileRes.rawPayload, PNG_BYTES)).toBe(0);

    // Property definitions and section values
    const propsRes = await server.inject(
      "GET",
      `/api/properties?bookId=${imported.id}`,
      user.token,
    );
    const importedProps = JSON.parse(propsRes.body);
    expect(importedProps).toHaveLength(1);
    const valuesRes = await server.inject(
      "GET",
      `/api/properties/section/${importedChapter.id}`,
      user.token,
    );
    expect(JSON.parse(valuesRes.body)).toEqual([
      { propertyId: importedProps[0].id, value: "Chapter" },
    ]);

    // Attributes
    const attrsRes = await server.inject(
      "GET",
      `/api/book-attributes?bookId=${imported.id}`,
      user.token,
    );
    const importedAttrs = JSON.parse(attrsRes.body);
    expect(importedAttrs).toHaveLength(1);
    expect(importedAttrs[0].title).toBe("Main Character");
    expect(importedAttrs[0].content).toBe("AIDA — the protagonist");
  });

  it.each([
    ["../../evil.png"],
    ["/etc/passwd"],
    ["a\\b.png"],
    ["a\0b.png"],
  ])("rejects hostile media filename %j with 400 and no traces", async (filename) => {
    const before = fs.readdirSync(path.join(server.config.DATA_DIR, "media"));
    const archive = await BuildTarGz(
      ArchiveFiles({
        mediaMetadata: [
          {
            id: "m1",
            slug: "pic",
            filename,
            mimeType: "image/png",
            size: PNG_BYTES.length,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
        mediaFiles: [{ name: "media/m1/innocent.png", content: PNG_BYTES }],
      }),
    );
    const res = await ImportArchive(server, user.token, archive);
    expect(res.statusCode).toBe(400);
    // Nothing written outside the existing book dirs, no temp dirs left.
    expect(fs.readdirSync(path.join(server.config.DATA_DIR, "media"))).toEqual(
      before,
    );
    expect(ListTempImportDirs(server)).toEqual([]);
  });

  it("rejects an archive whose media file is missing from the archive", async () => {
    const archive = await BuildTarGz(
      ArchiveFiles({
        mediaMetadata: [
          {
            id: "m1",
            slug: "pic",
            filename: "m1.png",
            mimeType: "image/png",
            size: PNG_BYTES.length,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    const res = await ImportArchive(server, user.token, archive);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a media file whose size does not match the metadata", async () => {
    const archive = await BuildTarGz(
      ArchiveFiles({
        mediaMetadata: [
          {
            id: "m1",
            slug: "pic",
            filename: "m1.png",
            mimeType: "image/png",
            size: PNG_BYTES.length + 5,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
        mediaFiles: [{ name: "media/m1/m1.png", content: PNG_BYTES }],
      }),
    );
    const res = await ImportArchive(server, user.token, archive);
    expect(res.statusCode).toBe(400);
  });

  it.each([
    ["missing manifest", ArchiveFiles({ omit: ["manifest.json"] })],
    ["unsupported version", ArchiveFiles({ version: "9.9" })],
    ["no sections", ArchiveFiles({ omit: ["sections.json"] })],
    [
      "media with html mime",
      ArchiveFiles({
        mediaMetadata: [
          {
            id: "m1",
            slug: "evil",
            filename: "m1.png",
            mimeType: "text/html",
            size: 5,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
        mediaFiles: [
          { name: "media/m1/m1.png", content: Buffer.from("<html>") },
        ],
      }),
    ],
  ])("rejects invalid archives (%s) with 400", async (_label, files) => {
    const archive = await BuildTarGz(files);
    const res = await ImportArchive(server, user.token, archive);
    expect(res.statusCode).toBe(400);
    expect(ListTempImportDirs(server)).toEqual([]);
  });

  it("rejects corrupt gzip and spoofed media content with 400", async () => {
    const corrupt = await ImportArchive(
      server,
      user.token,
      Buffer.from("this is not a gzip file"),
    );
    expect(corrupt.statusCode).toBe(400);

    const spoofed = await BuildTarGz(
      ArchiveFiles({
        mediaMetadata: [
          {
            id: "m1",
            slug: "spoof",
            filename: "m1.png",
            mimeType: "image/png",
            size: 8,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
        mediaFiles: [
          { name: "media/m1/m1.png", content: Buffer.from("<script>") },
        ],
      }),
    );
    const res = await ImportArchive(server, user.token, spoofed);
    expect(res.statusCode).toBe(400);
    expect(ListTempImportDirs(server)).toEqual([]);
  });

  it("imports a legacy 1.0 archive with the tolerated version files", async () => {
    const archive = await BuildTarGz(
      ArchiveFiles({ version: "1.0", includeLegacyFiles: true }),
    );
    const res = await ImportArchive(server, user.token, archive);
    expect(res.statusCode).toBe(201);
    const book = JSON.parse(res.body);
    const sectionsRes = await server.inject(
      "GET",
      `/api/sections?bookId=${book.id}`,
      user.token,
    );
    const sections = JSON.parse(sectionsRes.body);
    expect(sections.find((s: any) => s.title === "Chapter 1")).toBeDefined();
  });

  it("leaves no rows, files or temp dirs when the transaction fails", async () => {
    const SectionsData = require("../sections/SectionsData");
    const archive = await BuildTarGz(
      ArchiveFiles({
        bookName: "Doomed Import",
        mediaMetadata: [
          {
            id: "m1",
            slug: "pic",
            filename: "m1.png",
            mimeType: "image/png",
            size: PNG_BYTES.length,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ],
        mediaFiles: [{ name: "media/m1/m1.png", content: PNG_BYTES }],
      }),
    );

    (SectionsData.SectionsDataAdd as jest.Mock).mockImplementationOnce(
      async () => {
        throw new Error("boom");
      },
    );
    const res = await ImportArchive(server, user.token, archive);
    (SectionsData.SectionsDataAdd as jest.Mock).mockClear();

    expect(res.statusCode).toBe(500);
    const booksRes = await server.inject("GET", "/api/books", user.token);
    const names = JSON.parse(booksRes.body).map((b: any) => b.name);
    expect(names).not.toContain("Doomed Import");
    expect(ListTempImportDirs(server)).toEqual([]);
    // No media dir other than the books that already existed
    const mediaRoot = path.join(server.config.DATA_DIR, "media");
    const remaining = fs.readdirSync(mediaRoot);
    for (const dir of remaining) {
      const books = await server.query("SELECT id FROM books WHERE id = ?", [
        dir,
      ]);
      expect(books.length).toBeGreaterThan(0);
    }
  });
});
