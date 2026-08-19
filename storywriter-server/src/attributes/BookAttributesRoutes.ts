import { FastifyInstance, RequestGenericInterface } from "fastify";
import { BookAttribute } from "../model/BookAttribute";
import { AuthGetUserSession } from "../users/Auth";
import { BooksDataGetUserAccess } from "../books/BooksData";
import {
  BookAttributesDataAdd,
  BookAttributesDataDelete,
  BookAttributesDataGet,
  BookAttributesDataListByBook,
  BookAttributesDataUpdate,
} from "./BookAttributesData";

export class BookAttributesRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    // Helper: check book access
    async function checkBookAccess(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: any,
      bookId: string,
      requiredPermission: "read" | "write" = "read",
    ): Promise<boolean> {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        res.status(403).send({ error: "Access Denied" });
        return false;
      }
      if (userSession.role === "admin") return true;
      const access = await BooksDataGetUserAccess(bookId, userSession.userId);
      if (!access) {
        res.status(403).send({ error: "Access Denied" });
        return false;
      }
      if (requiredPermission === "write" && access !== "write") {
        res.status(403).send({ error: "Write Access Required" });
        return false;
      }
      return true;
    }

    // ==================== LIST BY BOOK ====================
    interface ListByBook extends RequestGenericInterface {
      Querystring: { bookId: string };
    }
    fastify.get<ListByBook>("/", async (req, res) => {
      const bookId = req.query?.bookId;
      if (!bookId) {
        return res.status(400).send({ error: "Missing: bookId" });
      }
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const attrs = await BookAttributesDataListByBook(bookId);
      return res.status(200).send(attrs.map((a) => a.toTransportJson()));
    });

    // ==================== GET ====================
    interface GetAttr extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetAttr>("/:id", async (req, res) => {
      const attr = await BookAttributesDataGet(req.params.id);
      if (!attr) {
        return res.status(404).send({ error: "Attribute Not Found" });
      }
      if (!(await checkBookAccess(req, res, attr.bookId, "read"))) return;
      return res.status(200).send(attr.toTransportJson());
    });

    // ==================== CREATE ====================
    interface PostAttr extends RequestGenericInterface {
      Body: { bookId: string; title?: string; content?: string };
    }
    fastify.post<PostAttr>("/", async (req, res) => {
      if (!(await checkBookAccess(req, res, req.body.bookId, "write"))) return;
      const attr = new BookAttribute();
      attr.bookId = req.body.bookId;
      attr.title = req.body.title || "New Attribute";
      attr.content = req.body.content || "";
      await BookAttributesDataAdd(attr);
      return res.status(201).send(attr.toTransportJson());
    });

    // ==================== UPDATE ====================
    interface PutAttr extends RequestGenericInterface {
      Params: { id: string };
      Body: { title?: string; content?: string };
    }
    fastify.put<PutAttr>("/:id", async (req, res) => {
      const attr = await BookAttributesDataGet(req.params.id);
      if (!attr) {
        return res.status(404).send({ error: "Attribute Not Found" });
      }
      if (!(await checkBookAccess(req, res, attr.bookId, "write"))) return;
      if (req.body.title !== undefined) attr.title = req.body.title;
      if (req.body.content !== undefined) attr.content = req.body.content;
      await BookAttributesDataUpdate(attr);
      return res.status(200).send(attr.toTransportJson());
    });

    // ==================== DELETE ====================
    interface DeleteAttr extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteAttr>("/:id", async (req, res) => {
      const attr = await BookAttributesDataGet(req.params.id);
      if (!attr) {
        return res.status(404).send({ error: "Attribute Not Found" });
      }
      if (!(await checkBookAccess(req, res, attr.bookId, "write"))) return;
      await BookAttributesDataDelete(req.params.id);
      return res.status(200).send({});
    });
  }
}
