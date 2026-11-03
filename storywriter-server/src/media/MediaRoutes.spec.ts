import * as fs from "fs-extra";
import * as path from "path";
import { TestServer, TestUser } from "../__tests__/TestServer";

jest.mock("./MediaData", () => {
  const actual = jest.requireActual("./MediaData");
  return {
    ...actual,
    MediaDataAdd: jest.fn(actual.MediaDataAdd),
  };
});

import * as MediaData from "./MediaData";

const mediaDataAddMock = MediaData.MediaDataAdd as jest.Mock;

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 3),
]);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16),
]);
const SVG_BYTES = Buffer.from(
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`,
);
const HTML_BYTES = Buffer.from("<!DOCTYPE html><p>hi</p>");

describe("Media routes", () => {
  let server: TestServer;
  let user: TestUser;
  let bookId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    const admin = await server.createUser("admin");
    user = await server.createUser("media-user", "user", admin.token);
    const book = await server.createBook(user.token, "Media Book");
    bookId = book.id;
  });

  afterAll(async () => {
    await server.close();
  });

  it("uploads a PNG with a server-generated filename and keeps the original name", async () => {
    const res = await server.uploadMedia(
      user.token,
      bookId,
      "my photo.png",
      PNG_BYTES,
      "image/png",
    );
    expect(res.statusCode).toBe(201);
    const media = JSON.parse(res.body);
    expect(media.filename).toBe(`${media.id}.png`);
    expect(media.originalFilename).toBe("my photo.png");
    // File stored under the generated name only.
    const mediaDir = path.join(
      server.config.DATA_DIR,
      "media",
      bookId,
      media.id,
    );
    expect(fs.readdirSync(mediaDir)).toEqual([`${media.id}.png`]);
  });

  it("rejects disallowed MIME types and spoofed content", async () => {
    const html = await server.uploadMedia(
      user.token,
      bookId,
      "page.html",
      HTML_BYTES,
      "text/html",
    );
    expect(html.statusCode).toBe(400);

    const spoofed = await server.uploadMedia(
      user.token,
      bookId,
      "evil.png",
      HTML_BYTES,
      "image/png",
    );
    expect(spoofed.statusCode).toBe(400);
  });

  it("serves raster images inline with nosniff", async () => {
    const upload = await server.uploadMedia(
      user.token,
      bookId,
      "pic.jpg",
      JPEG_BYTES,
      "image/jpeg",
    );
    const media = JSON.parse(upload.body);
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/media/${media.id}/file`,
      user.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("serves SVG as an attachment with nosniff", async () => {
    const upload = await server.uploadMedia(
      user.token,
      bookId,
      "vector.svg",
      SVG_BYTES,
      "image/svg+xml",
    );
    expect(upload.statusCode).toBe(201);
    const media = JSON.parse(upload.body);
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/media/${media.id}/file`,
      user.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("ignores a token passed as a query parameter (Authorization header only)", async () => {
    const upload = await server.uploadMedia(
      user.token,
      bookId,
      "query-token.png",
      PNG_BYTES,
      "image/png",
    );
    const media = JSON.parse(upload.body);
    // A valid JWT in the URL must not authenticate the request: <img> tags
    // cannot send headers, and tokens in URLs leak into caches and logs.
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/media/${media.id}/file?token=${encodeURIComponent(user.token)}`,
      undefined,
    );
    expect(res.statusCode).toBe(401);
  });

  it("falls back to a non-empty slug when the filename has no Latin characters", async () => {
    const first = await server.uploadMedia(
      user.token,
      bookId,
      "小说.png",
      PNG_BYTES,
      "image/png",
    );
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.body).slug).toBe("media");

    // Uniqueness still applies to the fallback slug.
    const second = await server.uploadMedia(
      user.token,
      bookId,
      "封面.png",
      PNG_BYTES,
      "image/png",
    );
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(second.body).slug).toBe("media-1");
  });

  it("returns 415 for stored media whose MIME type is not allow-listed", async () => {
    // A legacy row with a non-image MIME type (e.g. from an old import).
    const result = await server.exec(
      `INSERT INTO media (id, bookId, slug, filename, originalFilename, mimeType, size, dateCreated)
       VALUES (?, ?, ?, ?, '', ?, 10, ?)`,
      [
        "legacy-media-1",
        bookId,
        "legacy",
        "legacy-media-1.png",
        "text/html",
        new Date().toISOString(),
      ],
    );
    expect(result).toBe(1);
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/media/legacy-media-1/file`,
      user.token,
    );
    expect(res.statusCode).toBe(415);
  });

  it("clears section references when media is deleted and exports the placeholder", async () => {
    const upload = await server.uploadMedia(
      user.token,
      bookId,
      "delete-me.png",
      PNG_BYTES,
      "image/png",
    );
    expect(upload.statusCode).toBe(201);
    const media = JSON.parse(upload.body);

    const root = await server.getRootSection(user.token, bookId);
    const sectionRes = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: root.id,
      type: "media",
      title: "Illustration",
      mediaId: media.id,
    });
    expect(sectionRes.statusCode).toBe(201);
    const section = JSON.parse(sectionRes.body);

    const del = await server.inject(
      "DELETE",
      `/api/books/${bookId}/media/${media.id}`,
      user.token,
    );
    expect(del.statusCode).toBe(200);

    const rows = await server.query(
      "SELECT type, mediaId FROM sections WHERE id = ?",
      [section.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("media");
    expect(rows[0].mediaId).toBeNull();

    const exportRes = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=markdown`,
      user.token,
    );
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.body).toContain("[missing image:");
  });

  it("removes the written file when the metadata insert fails", async () => {
    const mediaRoot = path.join(server.config.DATA_DIR, "media", bookId);
    const dirsBefore = fs.existsSync(mediaRoot)
      ? fs.readdirSync(mediaRoot).sort()
      : [];
    const countBefore = await server.query(
      "SELECT COUNT(*) AS count FROM media WHERE bookId = ?",
      [bookId],
    );

    mediaDataAddMock.mockRejectedValueOnce(new Error("insert failed"));
    const res = await server.uploadMedia(
      user.token,
      bookId,
      "orphan.png",
      PNG_BYTES,
      "image/png",
    );
    expect(res.statusCode).toBe(500);

    const dirsAfter = fs.existsSync(mediaRoot)
      ? fs.readdirSync(mediaRoot).sort()
      : [];
    expect(dirsAfter).toEqual(dirsBefore);
    const countAfter = await server.query(
      "SELECT COUNT(*) AS count FROM media WHERE bookId = ?",
      [bookId],
    );
    expect(Number(countAfter[0].count)).toBe(Number(countBefore[0].count));
  });
});
