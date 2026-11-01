import { FastifyInstance } from "fastify";
import {
  AUTH_ERROR_CODE_UNAUTHENTICATED,
  AuthGetLiveUser,
} from "@devopsplaybook.io/common-utils";
import { LlmIsAvailable, LlmModel } from "./LlmClient";

export class LlmRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    // ==================== GET LLM STATUS ====================
    // Reports whether AI assistance is configured on this server.
    // Never exposes the API key.
    fastify.get("/status", async (req, res) => {
      const user = await AuthGetLiveUser(req);
      if (!user) {
        return res.status(401).send({
          error: "Authentication Required",
          code: AUTH_ERROR_CODE_UNAUTHENTICATED,
        });
      }
      return res
        .status(200)
        .send({ available: LlmIsAvailable(), model: LlmModel() });
    });
  }
}
