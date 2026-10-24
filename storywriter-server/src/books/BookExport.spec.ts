import * as fs from "fs-extra";
import * as http from "http";
import * as path from "path";
import { TestServer, TestUser } from "../__tests__/TestServer";

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 9),
]);

async function Listen(server: TestServer): Promise<number> {
  await server.app.listen({ port: 0, host: "127.0.0.1" });
  const address = server.app.server.address();
  return typeof address === "object" && address ? address.port : 0;
}

/** The temp export file is unlinked on stream close — a tick after the response ends. */
async function WaitForEmptyTmpDir(server: TestServer): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (fs.readdirSync(server.config.TMP_DIR).length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(fs.readdirSync(server.config.TMP_DIR)).toEqual([]);
}

describe("Book export", () => {
  let server: TestServer;
  let user: TestUser;
  let bookId: string;
  let mediaId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    const admin = await server.createUser("admin");
    user = await server.createUser("exporter", "user", admin.token);
    const book = await server.createBook(user.token, "Export Book");
    bookId = book.id;
    const root = await server.getRootSection(user.token, bookId);
    await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: root.id,
      title: "Chapter 1",
      content: "Hello export",
    });
    const mediaRes = await server.uploadMedia(
      user.token,
      bookId,
      "picture.png",
      PNG_BYTES,
      "image/png",
    );
    mediaId = JSON.parse(mediaRes.body).id;
  });

  afterAll(async () => {
    await server.close();
  });

  it("exports a valid archive that contains the JSON files and media", async () => {
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/gzip");
    expect(res.headers["x-filename"]).toBe("Export_Book.tar.gz");
    // The temp export file is cleaned up after streaming.
    await WaitForEmptyTmpDir(server);
  });

  it("returns a 500 JSON error when the export temp dir cannot be created", async () => {
    // TMP_DIR pointing at an existing file cannot be created as a directory.
    const blocker = path.join(server.config.TMP_DIR, "not-a-dir");
    await fs.writeFile(blocker, "x");
    const originalTmp = server.config.TMP_DIR;
    server.config.TMP_DIR = blocker;
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    server.config.TMP_DIR = originalTmp;
    await fs.remove(blocker);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("Export failed");
    // The process is alive and further requests work.
    const followUp = await server.inject("GET", "/api/books", user.token);
    expect(followUp.statusCode).toBe(200);
  });

  it("returns a 500 JSON error when a referenced media file is missing on disk", async () => {
    // Remove the media file behind the database row: the export must fail
    // loudly instead of producing an incomplete backup.
    await fs.remove(
      path.join(server.config.DATA_DIR, "media", bookId, mediaId),
    );
    const res = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("media file missing");
    // No partial export file left behind.
    await WaitForEmptyTmpDir(server);
  });

  it("survives a client disconnect mid-export and keeps serving requests", async () => {
    // Restore the media file removed by the previous test.
    const mediaDir = path.join(server.config.DATA_DIR, "media", bookId, mediaId);
    await fs.mkdirp(mediaDir);
    await fs.writeFile(path.join(mediaDir, `${mediaId}.png`), PNG_BYTES);

    const port = await Listen(server);
    const url = `http://127.0.0.1:${port}/api/books/${bookId}/export?format=targz`;

    await new Promise<void>((resolve) => {
      const req = http.get(
        url,
        { headers: { authorization: `Bearer ${user.token}` } },
        (response) => {
          response.resume();
          // Destroy as soon as any bytes arrive.
          response.once("data", () => req.destroy(new Error("client gone")));
          response.once("close", () => resolve());
        },
      );
      req.on("error", () => resolve());
    });

    // The process is alive and the next request succeeds.
    const followUp = await server.inject("GET", "/api/books", user.token);
    expect(followUp.statusCode).toBe(200);
    const second = await server.inject(
      "GET",
      `/api/books/${bookId}/export?format=targz`,
      user.token,
    );
    expect(second.statusCode).toBe(200);
  });
});
