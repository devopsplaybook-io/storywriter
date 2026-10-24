import { TestServer } from "./TestServer";

describe("Static file caching", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves index.html as revalidatable (no-cache), never immutable", async () => {
    for (const url of ["/", "/index.html"]) {
      const res = await server.inject("GET", url);
      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("serves hashed build assets as immutable with a long max-age", async () => {
    const res = await server.inject("GET", "/_nuxt/entry.abc123.js");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("serves other static files with a short max-age and no immutable", async () => {
    const res = await server.inject("GET", "/images/logo.svg");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("serves the SPA fallback for extensionless routes as no-cache with the shell", async () => {
    const res = await server.inject("GET", "/books/whatever");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.body).toContain("storywriter test");
  });
});
