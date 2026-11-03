jest.mock("axios");

import axios from "axios";
import { callLLMWithRetry, LlmClientInit } from "../analysis/LlmClient";

const postMock = axios.post as jest.Mock;

function initClient(overrides: Record<string, unknown> = {}) {
  LlmClientInit({
    LLM_API_KEY: "test-key",
    LLM_API_URL: "https://llm.example/chat",
    LLM_MODEL: "test-model",
    LLM_TIMEOUT_MS: 45000,
    LLM_OVERALL_TIMEOUT_MS: 120000,
    ...overrides,
  } as any);
}

const options = { systemPrompt: "system" };

describe("callLLMWithRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    postMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("makes 3 attempts with 1 s / 2 s backoff", async () => {
    initClient();
    postMock
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"))
      .mockResolvedValueOnce({
        data: { choices: [{ message: { content: "done" } }] },
      });

    const promise = callLLMWithRetry("prompt", options);
    expect(postMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(postMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBe("done");
    expect(postMock).toHaveBeenCalledTimes(3);
  });

  it("stops when the remaining budget is below the next delay", async () => {
    initClient({ LLM_OVERALL_TIMEOUT_MS: 1500 });
    postMock.mockRejectedValue(new Error("network"));

    const promise = callLLMWithRetry("prompt", options);
    const rejection = expect(promise).rejects.toThrow("network");
    await jest.advanceTimersByTimeAsync(1000);

    await rejection;
    // The second retry (2 s) would outlive the 1.5 s deadline, so it is skipped.
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry after the overall abort and surfaces the timeout error", async () => {
    initClient({ LLM_OVERALL_TIMEOUT_MS: 2000 });
    postMock.mockImplementation(
      (_url: string, _body: unknown, config: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          config.signal.addEventListener("abort", () =>
            reject(new Error("canceled")),
          );
        }),
    );

    const promise = callLLMWithRetry("prompt", options);
    const rejection = expect(promise).rejects.toThrow(
      "LLM API call aborted after the 2s overall timeout",
    );
    await jest.advanceTimersByTimeAsync(2000);

    await rejection;
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable 4xx responses", async () => {
    initClient();
    const error = Object.assign(new Error("bad request"), {
      response: { status: 400 },
    });
    postMock.mockRejectedValue(error);

    await expect(callLLMWithRetry("prompt", options)).rejects.toThrow(
      "bad request",
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 5xx responses", async () => {
    initClient();
    postMock
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), {
          response: { status: 429 },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("server error"), {
          response: { status: 503 },
        }),
      )
      .mockResolvedValueOnce({
        data: { choices: [{ message: { content: "finally" } }] },
      });

    const promise = callLLMWithRetry("prompt", options);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe("finally");
    expect(postMock).toHaveBeenCalledTimes(3);
  });
});
