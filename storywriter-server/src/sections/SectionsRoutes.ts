import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Section, SectionType } from "../model/Section";
import { AuthGetUserSession } from "../users/Auth";
import { BooksDataGetUserAccess } from "../books/BooksData";
import {
  SectionsDataAdd,
  SectionsDataCopy,
  SectionsDataDelete,
  SectionsDataGet,
  SectionsDataGetRootSection,
  SectionsDataListByBook,
  SectionsDataListChildren,
  SectionsDataMove,
  SectionsDataUpdate,
  SectionsDataUpdateOrder,
} from "./SectionsData";

export class SectionsRoutes {
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    // Helper: check user has at least read access to a book
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

    // ==================== LIST SECTIONS BY BOOK ====================
    interface ListByBook extends RequestGenericInterface {
      Querystring: { bookId: string };
    }
    fastify.get<ListByBook>("/", async (req, res) => {
      const bookId = req.query?.bookId;
      if (!bookId) {
        return res.status(400).send({ error: "Missing: bookId" });
      }
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const sections = await SectionsDataListByBook(bookId);
      return res.status(200).send(sections.map((s) => s.toTransportJson()));
    });

    // ==================== GET ROOT SECTION ====================
    interface GetRoot extends RequestGenericInterface {
      Querystring: { bookId: string };
    }
    fastify.get<GetRoot>("/root", async (req, res) => {
      const bookId = req.query?.bookId;
      if (!bookId) {
        return res.status(400).send({ error: "Missing: bookId" });
      }
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const root = await SectionsDataGetRootSection(bookId);
      if (!root) {
        return res.status(404).send({ error: "Root Section Not Found" });
      }
      return res.status(200).send(root.toTransportJson());
    });

    // ==================== GET SECTION ====================
    interface GetSection extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetSection>("/:id", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "read"))) return;
      return res.status(200).send(section.toTransportJson());
    });

    // ==================== GET CHILDREN ====================
    interface GetChildren extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetChildren>("/:id/children", async (req, res) => {
      const parent = await SectionsDataGet(req.params.id);
      if (!parent) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, parent.bookId, "read"))) return;
      const children = await SectionsDataListChildren(req.params.id);
      return res.status(200).send(children.map((s) => s.toTransportJson()));
    });

    // ==================== CREATE SECTION ====================
    interface PostSection extends RequestGenericInterface {
      Body: {
        bookId: string;
        parentId: string;
        type?: SectionType;
        title?: string;
        content?: string;
        mediaId?: string;
        caption?: string;
        orderIndex?: number;
      };
    }
    fastify.post<PostSection>("/", async (req, res) => {
      if (!(await checkBookAccess(req, res, req.body.bookId, "write"))) return;

      const section = new Section();
      section.bookId = req.body.bookId;
      section.parentId = req.body.parentId;
      section.type = req.body.type || "text";
      section.title = req.body.title || "New Section";
      section.content = req.body.content || "";
      section.mediaId = req.body.mediaId || null;
      section.caption = req.body.caption || "";
      section.orderIndex = req.body.orderIndex ?? 0;
      await SectionsDataAdd(section);
      return res.status(201).send(section.toTransportJson());
    });

    // ==================== UPDATE SECTION ====================
    interface PutSection extends RequestGenericInterface {
      Params: { id: string };
      Body: {
        type?: SectionType;
        title?: string;
        content?: string;
        analysis?: string;
        mediaId?: string;
        caption?: string;
      };
    }
    fastify.put<PutSection>("/:id", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;

      if (req.body.type !== undefined) section.type = req.body.type;
      if (req.body.title !== undefined) section.title = req.body.title;
      if (req.body.content !== undefined) section.content = req.body.content;
      if (req.body.mediaId !== undefined) section.mediaId = req.body.mediaId;
      if (req.body.caption !== undefined) section.caption = req.body.caption;
      await SectionsDataUpdate(section);
      return res.status(200).send(section.toTransportJson());
    });

    // ==================== REORDER SECTION ====================
    interface PutOrder extends RequestGenericInterface {
      Params: { id: string };
      Body: { orderIndex: number };
    }
    fastify.put<PutOrder>("/:id/order", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
      await SectionsDataUpdateOrder(req.params.id, req.body.orderIndex);
      return res.status(200).send({});
    });

    // ==================== MOVE SECTION ====================
    interface PutMove extends RequestGenericInterface {
      Params: { id: string };
      Body: { parentId: string; orderIndex: number };
    }
    fastify.put<PutMove>("/:id/move", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
      await SectionsDataMove(
        req.params.id,
        req.body.parentId,
        req.body.orderIndex,
      );
      return res.status(200).send({});
    });

    // ==================== COPY SECTION ====================
    interface PostCopy extends RequestGenericInterface {
      Params: { id: string };
      Body: { targetParentId: string; orderIndex: number };
    }
    fastify.post<PostCopy>("/:id/copy", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
      const copy = await SectionsDataCopy(
        req.params.id,
        req.body.targetParentId,
        req.body.orderIndex,
      );
      return res.status(201).send(copy.toTransportJson());
    });

    // ==================== DELETE SECTION ====================
    interface DeleteSection extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteSection>("/:id", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (section.parentId === null) {
        return res.status(400).send({ error: "Cannot delete root section" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
      await SectionsDataDelete(req.params.id);
      return res.status(200).send({});
    });
  }
}
