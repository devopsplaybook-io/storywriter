import { FastifyInstance, RequestGenericInterface } from "fastify";
import { AuthGetUserSession } from "@devopsplaybook.io/common-utils";
import { BooksDataGet } from "../books/BooksData";
import { CheckBookAccess } from "../books/BookAccess";
import { Config } from "../Config";
import {
  BookAnalysisGenerate,
  BookAnalysisGetCached,
  BookAnalysisIsStale,
} from "./BookAnalysis";
import { LlmIsAvailable } from "./LlmClient";
import {
  LlmLimitMessage,
  LlmRequestAcquire,
  LlmRequestRelease,
} from "../utils/RequestLimits";

export class BookAnalysisRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;
    // ==================== GET BOOK ANALYSIS ====================
    interface GetAnalysis extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetAnalysis>("/:id/analysis", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "read", book)))
        return;
      const cached = await BookAnalysisGetCached(req.params.id);
      if (!cached) {
        return res.status(200).send({
          generatedAt: null,
          bookId: req.params.id,
          bookName: book.name,
          summary: null,
          strengths: null,
          improvements: null,
          suggestions: null,
          stale: false,
        });
      }
      return res.status(200).send({
        ...cached,
        stale: await BookAnalysisIsStale(req.params.id),
      });
    });

    // ==================== GENERATE BOOK ANALYSIS ====================
    interface PostAnalysis extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.post<PostAnalysis>("/:id/analysis", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "write", book)))
        return;
      if (!LlmIsAvailable()) {
        return res.status(503).send({
          error:
            "AI assistance is not configured on this server (LLM_API_KEY missing)",
        });
      }
      const guard = LlmRequestAcquire(userSession.userId, config);
      if (guard !== "ok") {
        return res.status(429).send({ error: LlmLimitMessage(guard) });
      }

      try {
        const result = await BookAnalysisGenerate(req.params.id);
        return res.status(200).send(result);
      } catch (error) {
        return res
          .status(502)
          .send({ error: (error as Error).message || "Analysis failed" });
      } finally {
        LlmRequestRelease(userSession.userId);
      }
    });
  }
}
