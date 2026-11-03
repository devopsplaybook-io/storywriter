import Fastify, { FastifyError } from "fastify";
import { Writable } from "stream";
import { RegisterErrorHandler } from "../ErrorHandler";

const INTERNAL_DETAIL =
  "SQLITE_ERROR: no such table: secret_table at /data/storywriter.db";

function makeCapturingStream(): {
  stream: NodeJS.WritableStream;
  text: () => string;
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => chunks.join("") };
}

async function flushLogs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("global error handler", () => {
  let app: ReturnType<typeof Fastify>;
  let captured: ReturnType<typeof makeCapturingStream>;

  beforeEach(async () => {
    captured = makeCapturingStream();
    app = Fastify({ logger: { level: "error", stream: captured.stream } });
    RegisterErrorHandler(app);
    app.get("/boom", async () => {
      throw new Error(INTERNAL_DETAIL);
    });
    app.get("/intentional", async () => {
      const error = new Error("Book Not Found") as FastifyError;
      error.statusCode = 404;
      error.name = "NotFoundError";
      throw error;
    });
    app.get("/forbidden", async (_req, reply) => {
      reply.status(403);
      throw new Error("Forbidden by policy");
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a generic 5xx body and logs the real error", async () => {
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal Server Error" });
    expect(res.body).not.toContain("SQLITE_ERROR");
    expect(res.body).not.toContain("secret_table");
    expect(res.body).not.toContain("storywriter.db");
    expect(res.body).not.toContain("at ");

    await flushLogs();
    expect(captured.text()).toContain(INTERNAL_DETAIL);
  });

  it("preserves intentional 4xx messages", async () => {
    const res = await app.inject({ method: "GET", url: "/intentional" });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Book Not Found" });
  });

  it("uses the reply status when the error carries none", async () => {
    const res = await app.inject({ method: "GET", url: "/forbidden" });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: "Forbidden by policy" });
  });
});
