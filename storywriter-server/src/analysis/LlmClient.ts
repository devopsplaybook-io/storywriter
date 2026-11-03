import axios from "axios";
import { Config } from "../Config";
import { OTelLogger } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("llm-client");

let config: Config;

/** Stable client-facing message for any LLM provider failure. */
export const AI_PROVIDER_ERROR_MESSAGE = "AI provider request failed";

// ── Public Interface ──────────────────────────────────────────────────────────

export function LlmClientInit(configIn: Config): void {
  config = configIn;
  if (configIn.LLM_API_KEY) {
    logger.info("[LlmClient] LLM integration enabled");
  } else {
    logger.info(
      "[LlmClient] LLM integration disabled (no API key configured)",
    );
  }
}

export function LlmIsAvailable(): boolean {
  return Boolean(config?.LLM_API_KEY);
}

export function LlmModel(): string {
  return config?.LLM_MODEL || "";
}

export function LlmTimeoutMs(): number {
  return config?.LLM_TIMEOUT_MS || 45000;
}

export function LlmOverallTimeoutMs(): number {
  return config?.LLM_OVERALL_TIMEOUT_MS || 120000;
}

export interface LlmCallOptions {
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

// ── LLM API call with retry ───────────────────────────────────────────────────

/**
 * Call the LLM API with a bounded retry budget: 3 attempts total (2 retries
 * with 1 s / 2 s backoff), a per-attempt timeout (LLM_TIMEOUT_MS) and an
 * overall deadline (LLM_OVERALL_TIMEOUT_MS) enforced with an AbortController so
 * in-flight provider calls are cancelled and remaining attempts are skipped
 * once the budget is exhausted.
 */
export async function callLLMWithRetry(
  prompt: string,
  options: LlmCallOptions,
  maxRetries = 2,
): Promise<string> {
  const overallTimeoutMs = LlmOverallTimeoutMs();
  const deadline = Date.now() + overallTimeoutMs;
  const abort = new AbortController();
  const overallTimer = setTimeout(() => abort.abort(), overallTimeoutMs);
  const maxAttempts = Math.max(1, maxRetries + 1);
  try {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (abort.signal.aborted || Date.now() >= deadline) {
        break;
      }
      try {
        const response = await axios.post(
          config.LLM_API_URL,
          {
            model: config.LLM_MODEL,
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 4000,
            messages: [
              {
                role: "system",
                content: options.systemPrompt,
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.LLM_API_KEY}`,
            },
            timeout: LlmTimeoutMs(),
            signal: abort.signal,
          },
        );
        return response.data?.choices?.[0]?.message?.content || "";
      } catch (error) {
        lastError = error as Error;
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status && status < 500 && status !== 429) {
          throw error;
        }
        if (abort.signal.aborted) {
          break;
        }
        if (attempt < maxAttempts - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          // Do not start a sleep that would outlive the overall deadline.
          if (Date.now() + delay >= deadline) {
            break;
          }
          logger.warn(
            `[LlmClient] LLM API attempt ${attempt + 1} failed (status=${status}), retrying in ${delay}ms: ${lastError.message}`,
          );
          await sleepUntilAborted(delay, abort.signal);
        }
      }
    }
    if (abort.signal.aborted) {
      throw new Error(
        `LLM API call aborted after the ${Math.round(overallTimeoutMs / 1000)}s overall timeout`,
      );
    }
    throw lastError || new Error("LLM API call failed after retries");
  } finally {
    clearTimeout(overallTimer);
  }
}

/** Sleep that resolves early when the overall abort fires. */
function sleepUntilAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
