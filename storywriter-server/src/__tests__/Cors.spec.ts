import { CorsAllowedOrigins } from "../Cors";
import { RateLimitResetForTests } from "../utils/RateLimit";
import { TestServer } from "./TestServer";

describe("CorsAllowedOrigins", () => {
  it("parses an explicit comma-separated allow-list", () => {
    expect(
      CorsAllowedOrigins(" https://a.example , https://b.example ,, "),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("never honours the wildcard", () => {
    expect(CorsAllowedOrigins("*")).toEqual([]);
    expect(CorsAllowedOrigins("https://a.example, *")).toEqual([
      "https://a.example",
    ]);
  });

  it("is empty by default", () => {
    expect(CorsAllowedOrigins("")).toEqual([]);
  });
});

describe("CORS registration", () => {
  let emptyServer: TestServer;

  beforeAll(async () => {
    emptyServer = new TestServer();
    await emptyServer.init();
  });

  afterAll(async () => {
    await emptyServer.close();
    RateLimitResetForTests();
  });

  it("sends no Access-Control-Allow-Origin when no allow-list is configured", async () => {
    const res = await emptyServer.inject(
      "GET",
      "/api/status",
      undefined,
      undefined,
      { origin: "https://a.example" },
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  describe("with an explicit allow-list", () => {
    let server: TestServer;

    beforeAll(async () => {
      server = new TestServer();
      await server.init({
        corsPolicyOrigin: "https://a.example, https://b.example",
      });
    });

    afterAll(async () => {
      await server.close();
      RateLimitResetForTests();
    });

    it("echoes an allowed origin", async () => {
      const res = await server.inject(
        "GET",
        "/api/status",
        undefined,
        undefined,
        { origin: "https://a.example" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://a.example",
      );
    });

    it("does not allow an unlisted origin", async () => {
      const res = await server.inject(
        "GET",
        "/api/status",
        undefined,
        undefined,
        { origin: "https://evil.example" },
      );
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("never echoes the wildcard", async () => {
      const res = await server.inject(
        "GET",
        "/api/status",
        undefined,
        undefined,
        { origin: "*" },
      );
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("answers a preflight for an allowed origin", async () => {
      const res = await server.inject(
        "OPTIONS",
        "/api/status",
        undefined,
        undefined,
        {
          origin: "https://b.example",
          "access-control-request-method": "GET",
        },
      );
      expect(res.statusCode).toBeLessThan(300);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://b.example",
      );
    });
  });
});
