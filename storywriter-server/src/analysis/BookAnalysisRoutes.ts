import { FastifyInstance, RequestGenericInterface } from "fastify";
import { AuthGetUserSession } from "../users/Auth";
import { BooksDataGet, BooksDataGetUserAccess } from "../books/BooksData";
import { BookAnalysisGenerate, BookAnalysisGetCached } from "./BookAnalysis";

export class BookAnalysisRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    // ==================== GET BOOK ANALYSIS ====================
    interface GetAnalysis extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetAnalysis>("/:id/analysis", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
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
        });
      }
      return res.status(200).send(cached);
    });

    // ==================== GENERATE BOOK ANALYSIS ====================
    interface PostAnalysis extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.post<PostAnalysis>("/:id/analysis", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }

      // Check write access or admin
      if (userSession.role !== "admin") {
        const access = await BooksDataGetUserAccess(
          book.id,
          userSession.userId,
        );
        if (access !== "write") {
          return res.status(403).send({ error: "Write Access Required" });
        }
      }

      const result = await BookAnalysisGenerate(req.params.id);
      return res.status(200).send(result);
    });
  }
}
