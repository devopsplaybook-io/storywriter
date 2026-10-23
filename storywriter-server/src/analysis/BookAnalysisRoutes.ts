import { FastifyInstance, RequestGenericInterface } from "fastify";
import { BooksDataGet } from "../books/BooksData";
import { CheckBookAccess } from "../books/BookAccess";
import {
  BookAnalysisGenerate,
  BookAnalysisGetCached,
  BookAnalysisIsStale,
} from "./BookAnalysis";
import { LlmIsAvailable } from "./LlmClient";

export class BookAnalysisRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
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

      try {
        const result = await BookAnalysisGenerate(req.params.id);
        return res.status(200).send(result);
      } catch (error) {
        return res
          .status(502)
          .send({ error: (error as Error).message || "Analysis failed" });
      }
    });
  }
}
