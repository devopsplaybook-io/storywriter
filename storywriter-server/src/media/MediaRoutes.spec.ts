import * as fs from "fs-extra";
import * as path from "path";
import { TestServer, TestUser } from "../__tests__/TestServer";

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
});
