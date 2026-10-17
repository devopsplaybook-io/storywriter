import axios from "axios";
import { Config } from "../Config";

const logger = console;

let config: Config;

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

export const LLM_TIMEOUT_MS = 90000;

export interface LlmCallOptions {
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

// ── LLM API call with retry ───────────────────────────────────────────────────

export async function callLLMWithRetry(
  prompt: string,
  options: LlmCallOptions,
  maxRetries = 3,
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
          timeout: LLM_TIMEOUT_MS,
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
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          `[LlmClient] LLM API attempt ${attempt + 1} failed (status=${status}), retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("LLM API call failed after retries");
}
