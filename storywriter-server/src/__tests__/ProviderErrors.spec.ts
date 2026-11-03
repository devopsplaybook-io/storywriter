import { Writable } from "stream";

jest.mock("../analysis/LlmClient", () => ({
  ...jest.requireActual("../analysis/LlmClient"),
  LlmClientInit: jest.fn(),
  LlmIsAvailable: jest.fn(() => true),
  LlmModel: jest.fn(() => "test-model"),
  LlmTimeoutMs: () => 45000,
  LlmOverallTimeoutMs: () => 120000,
  callLLMWithRetry: jest.fn(),
}));

import {
  AI_PROVIDER_ERROR_MESSAGE,
  callLLMWithRetry,
  LlmIsAvailable,
} from "../analysis/LlmClient";
import { RateLimitResetForTests } from "../utils/RateLimit";
import { TestServer } from "./TestServer";

const callLLMWithRetryMock = callLLMWithRetry as jest.Mock;
const llmIsAvailableMock = LlmIsAvailable as jest.Mock;

const PROVIDER_DETAIL =
  "Provider 500 at https://api.provider.internal/v1/chat?request_id=req-42 body={\"detail\":\"secret-upstream\"}";

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

function flushLogs(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("AI provider errors are not echoed to clients", () => {
  let server: TestServer;
  let admin: { id: string; token: string };
  let bookId: string;
  let sectionId: string;
  let captured: ReturnType<typeof makeCapturingStream>;

  beforeAll(async () => {
    captured = makeCapturingStream();
    server = new TestServer();
    await server.init({
      logger: { level: "error", stream: captured.stream },
    });
    admin = await server.createUser("provider-admin", "admin");
    const book = await server.createBook(admin.token, "Provider errors");
    bookId = book.id;
    const root = await server.getRootSection(admin.token, bookId);
    const sectionRes = await server.inject("POST", "/api/sections", admin.token, {
      bookId,
      parentId: root.id,
      type: "text",
      title: "Chapter",
      content: "Some content for the provider failure test.",
    });
    expect(sectionRes.statusCode).toBe(201);
    sectionId = JSON.parse(sectionRes.body).id;
    server.config.LLM_API_KEY = "test-key";
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  beforeEach(() => {
    callLLMWithRetryMock.mockReset();
    llmIsAvailableMock.mockReturnValue(true);
  });

  it("returns a stable 502 for a failed book analysis and logs the detail", async () => {
    callLLMWithRetryMock.mockRejectedValueOnce(new Error(PROVIDER_DETAIL));

    const res = await server.inject(
      "POST",
      `/api/books/${bookId}/analysis`,
      admin.token,
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: AI_PROVIDER_ERROR_MESSAGE });
    expect(res.body).not.toContain("provider.internal");
    expect(res.body).not.toContain("secret-upstream");
    expect(res.body).not.toContain("request_id");

    await flushLogs();
    expect(captured.text()).toContain("provider.internal");
    expect(captured.text()).toContain("secret-upstream");
  });

  it("returns a stable 502 for a failed section analysis and logs the detail", async () => {
    callLLMWithRetryMock.mockRejectedValueOnce(new Error(PROVIDER_DETAIL));

    const res = await server.inject(
      "POST",
      `/api/sections/${sectionId}/analysis`,
      admin.token,
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: AI_PROVIDER_ERROR_MESSAGE });
    expect(res.body).not.toContain("provider.internal");
    expect(res.body).not.toContain("secret-upstream");

    await flushLogs();
    expect(captured.text()).toContain("provider.internal");
    expect(captured.text()).toContain("secret-upstream");
  });

  it("returns a stable 502 for a failed AI action", async () => {
    callLLMWithRetryMock.mockRejectedValueOnce(new Error(PROVIDER_DETAIL));

    const res = await server.inject(
      "POST",
      `/api/sections/${sectionId}/ai-action`,
      admin.token,
      { action: "summarize" },
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: AI_PROVIDER_ERROR_MESSAGE });
    expect(res.body).not.toContain("provider.internal");
  });

  it("keeps the intentional 503 when AI is not configured", async () => {
    llmIsAvailableMock.mockReturnValue(false);

    const res = await server.inject(
      "POST",
      `/api/books/${bookId}/analysis`,
      admin.token,
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toContain(
      "AI assistance is not configured",
    );
  });
});
