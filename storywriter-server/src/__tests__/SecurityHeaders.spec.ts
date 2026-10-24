import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { InlineScriptHashes } from "../SecurityHeaders";
import { TestServer } from "./TestServer";

describe("InlineScriptHashes", () => {
  let webDir: string;

  beforeEach(() => {
    webDir = fs.mkdtempSync(path.join(os.tmpdir(), "csp-web-"));
  });

  afterEach(() => {
    fs.rmSync(webDir, { recursive: true, force: true });
  });

  function writeIndex(scripts: string): void {
    fs.writeFileSync(
      path.join(webDir, "index.html"),
      `<html><body>${scripts}</body></html>`,
    );
  }

  it("hashes inline classic, module and importmap scripts", () => {
    writeIndex(
      '<script>window.__NUXT__={};</script>' +
        '<script type="importmap">{"imports":{"#entry":"/a.js"}}</script>' +
        '<script type="module">import "#entry"</script>',
    );
    const hashes = InlineScriptHashes(webDir);
    expect(hashes).toHaveLength(3);
    for (const body of [
      "window.__NUXT__={};",
      '{"imports":{"#entry":"/a.js"}}',
      'import "#entry"',
    ]) {
      const digest = crypto
        .createHash("sha256")
        .update(body, "utf8")
        .digest("base64");
      expect(hashes).toContain(`'sha256-${digest}'`);
    }
  });

  it("skips external scripts and non-executable data blocks", () => {
    writeIndex(
      '<script src="/_nuxt/entry.js"></script>' +
        '<script type="application/json">[1,2]</script>' +
        "<script>  </script>" +
        '<script>keep me</script>',
    );
    const hashes = InlineScriptHashes(webDir);
    expect(hashes).toHaveLength(1);
    const digest = crypto
      .createHash("sha256")
      .update("keep me", "utf8")
      .digest("base64");
    expect(hashes).toContain(`'sha256-${digest}'`);
  });

  it("returns no hashes when index.html is missing", () => {
    expect(InlineScriptHashes(webDir)).toEqual([]);
  });
});

describe("Security headers", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
  });

  afterAll(async () => {
    await server.close();
  });

  it("sets the strict CSP and hardening headers on API responses", async () => {
    const res = await server.inject("GET", "/api/status");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
    expect(res.headers["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(res.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers["permissions-policy"]).toContain("camera=()");
  });

  it("sets the security headers on the SPA index too", async () => {
    const res = await server.inject("GET", "/");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sends Cache-Control: no-store for API data responses", async () => {
    const res = await server.inject("GET", "/api/status");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("does not override the media file's private no-store policy", async () => {
    const admin = await server.createUser("headers-admin");
    const user = await server.createUser(
      "headers-user",
      "user",
      admin.token,
    );
    const book = await server.createBook(user.token, "Headers Book");
    const PNG_BYTES = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16, 3),
    ]);
    const upload = await server.uploadMedia(
      user.token,
      book.id,
      "h.png",
      PNG_BYTES,
      "image/png",
    );
    const media = JSON.parse(upload.body);
    const res = await server.inject(
      "GET",
      `/api/books/${book.id}/media/${media.id}/file`,
      user.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
