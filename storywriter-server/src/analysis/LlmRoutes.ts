import { FastifyInstance } from "fastify";
import { AuthGetUserSession } from "@devopsplaybook.io/common-utils";
import { LlmIsAvailable, LlmModel } from "./LlmClient";

export class LlmRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    // ==================== GET LLM STATUS ====================
    // Reports whether AI assistance is configured on this server.
    // Never exposes the API key.
    fastify.get("/status", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      return res
        .status(200)
        .send({ available: LlmIsAvailable(), model: LlmModel() });
    });
  }
}
