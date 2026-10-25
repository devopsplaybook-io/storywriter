import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Section, SectionType } from "../model/Section";
import { CheckBookAccess } from "../books/BookAccess";
import { MediaDataGet } from "../media/MediaData";
import {
  SectionAiActionGenerate,
  SectionAnalysisGenerate,
  isAiActionId,
  LlmUnavailableError,
} from "../analysis/SectionAnalysis";
import {
  MAX_COPY_DEPTH,
  MAX_COPY_NODES,
  SectionsConflictError,
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
import { collectSubtree, isSelfOrDescendant, subtreeDepth } from "./SectionsTree";
import {
  LlmLimitMessage,
  LlmRequestAcquire,
  LlmRequestRelease,
} from "../utils/RequestLimits";
import { AuthGetUserSession } from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";

export class SectionsRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;
    // Shared error mapping for AI endpoints: unconfigured server → 503,
    // concurrent section edit → 409, generation failure → 502 with the
    // underlying message.
    function sendAiError(res: any, error: unknown): void {
      if (error instanceof LlmUnavailableError) {
        res.status(503).send({ error: error.message });
        return;
      }
      if (error instanceof SectionsConflictError) {
        res.status(409).send({
          error: "Section was modified by someone else",
          revision: error.section.revision,
        });
        return;
      }
      res
        .status(502)
        .send({ error: (error as Error)?.message || "AI request failed" });
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
      if (!(await CheckBookAccess(req, res, bookId, "read"))) return;
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
      if (!(await CheckBookAccess(req, res, bookId, "read"))) return;
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
      if (!(await CheckBookAccess(req, res, section.bookId, "read"))) return;
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
      if (!(await CheckBookAccess(req, res, parent.bookId, "read"))) return;
      const children = await SectionsDataListChildren(
        req.params.id,
        parent.bookId,
      );
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
      if (!req.body?.bookId) {
        return res.status(400).send({ error: "Missing: bookId" });
      }
      if (!req.body?.parentId) {
        return res.status(400).send({ error: "Missing: parentId" });
      }
      if (!(await CheckBookAccess(req, res, req.body.bookId, "write"))) return;

      // Only container sections can have children
      const parent = await SectionsDataGet(req.body.parentId);
      if (!parent) {
        return res.status(404).send({ error: "Parent Section Not Found" });
      }
      if (parent.bookId !== req.body.bookId) {
        return res
          .status(400)
          .send({ error: "Parent section is in a different book" });
      }
      if (parent.type !== "container") {
        return res
          .status(400)
          .send({ error: "Only container sections can have sub-sections" });
      }
      if (req.body.mediaId) {
        const media = await MediaDataGet(req.body.mediaId);
        if (!media || media.bookId !== req.body.bookId) {
          return res
            .status(400)
            .send({ error: "Media is in a different book" });
        }
      }

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
        title?: string;
        content?: string;
        analysis?: string;
        mediaId?: string;
        caption?: string;
        revision?: number;
      };
    }
    fastify.put<PutSection>("/:id", async (req, res) => {
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;

      if (req.body.mediaId) {
        const media = await MediaDataGet(req.body.mediaId);
        if (!media || media.bookId !== section.bookId) {
          return res
            .status(400)
            .send({ error: "Media is in a different book" });
        }
      }

      if (req.body.title !== undefined) section.title = req.body.title;
      if (req.body.content !== undefined) section.content = req.body.content;
      if (req.body.analysis !== undefined) section.analysis = req.body.analysis;
      if (req.body.mediaId !== undefined) section.mediaId = req.body.mediaId;
      if (req.body.caption !== undefined) section.caption = req.body.caption;
      try {
        // Requests without a revision keep the unconditional update
        // (backwards-compatible for API-token scripts).
        await SectionsDataUpdate(section, req.body.revision);
      } catch (error) {
        if (error instanceof SectionsConflictError) {
          return res.status(409).send({
            error: "Section was modified by someone else",
            revision: error.section.revision,
          });
        }
        throw error;
      }
      return res.status(200).send(section.toTransportJson());
    });

    // ==================== GENERATE SECTION ANALYSIS ====================
    interface PostSectionAnalysis extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.post<PostSectionAnalysis>("/:id/analysis", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;
      if (section.type !== "text") {
        return res
          .status(400)
          .send({ error: "AI analysis is only available for text sections" });
      }
      const guard = LlmRequestAcquire(userSession.userId, config);
      if (guard !== "ok") {
        return res.status(429).send({ error: LlmLimitMessage(guard) });
      }
      try {
        const updated = await SectionAnalysisGenerate(section);
        return res.status(200).send(updated.toTransportJson());
      } catch (error) {
        return sendAiError(res, error);
      } finally {
        LlmRequestRelease(userSession.userId);
      }
    });

    // ==================== SECTION AI ACTION ====================
    interface PostSectionAiAction extends RequestGenericInterface {
      Params: { id: string };
      Body: { action: string; selection?: string };
    }
    fastify.post<PostSectionAiAction>("/:id/ai-action", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      const section = await SectionsDataGet(req.params.id);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;
      if (section.type !== "text") {
        return res
          .status(400)
          .send({ error: "AI actions are only available for text sections" });
      }
      if (!isAiActionId(req.body.action)) {
        return res.status(400).send({ error: "Unknown AI action" });
      }
      const guard = LlmRequestAcquire(userSession.userId, config);
      if (guard !== "ok") {
        return res.status(429).send({ error: LlmLimitMessage(guard) });
      }
      try {
        const text = await SectionAiActionGenerate(
          section,
          req.body.action,
          req.body.selection,
        );
        return res.status(200).send({ text });
      } catch (error) {
        return sendAiError(res, error);
      } finally {
        LlmRequestRelease(userSession.userId);
      }
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
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;
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
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;

      if (!req.body?.parentId) {
        return res.status(400).send({ error: "Missing: parentId" });
      }
      // Only container sections can have children
      const targetParent = await SectionsDataGet(req.body.parentId);
      if (!targetParent) {
        return res
          .status(404)
          .send({ error: "Target Parent Section Not Found" });
      }
      if (targetParent.type !== "container") {
        return res
          .status(400)
          .send({ error: "Can only move sections into containers" });
      }
      if (section.parentId === null) {
        return res.status(400).send({ error: "Cannot move the root section" });
      }
      if (targetParent.bookId !== section.bookId) {
        return res
          .status(400)
          .send({ error: "Section and target parent are in different books" });
      }
      const allSections = await SectionsDataListByBook(section.bookId);
      if (isSelfOrDescendant(section.id, targetParent.id, allSections)) {
        return res
          .status(400)
          .send({ error: "Cannot move a section into its own subtree" });
      }

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
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;

      if (!req.body?.targetParentId) {
        return res.status(400).send({ error: "Missing: targetParentId" });
      }
      // Only container sections can have children
      const targetParent = await SectionsDataGet(req.body.targetParentId);
      if (!targetParent) {
        return res
          .status(404)
          .send({ error: "Target Parent Section Not Found" });
      }
      if (targetParent.type !== "container") {
        return res
          .status(400)
          .send({ error: "Can only copy sections into containers" });
      }
      if (targetParent.bookId !== section.bookId) {
        return res
          .status(400)
          .send({ error: "Section and target parent are in different books" });
      }
      const allSections = await SectionsDataListByBook(section.bookId);
      if (isSelfOrDescendant(section.id, targetParent.id, allSections)) {
        return res
          .status(400)
          .send({ error: "Cannot copy a section into its own subtree" });
      }
      if (
        collectSubtree(section.id, allSections).length > MAX_COPY_NODES
      ) {
        return res.status(400).send({
          error: `Copy exceeds the maximum of ${MAX_COPY_NODES} sections`,
        });
      }
      if (subtreeDepth(section.id, allSections) > MAX_COPY_DEPTH) {
        return res.status(400).send({
          error: `Copy exceeds the maximum depth of ${MAX_COPY_DEPTH}`,
        });
      }

      try {
        const copy = await SectionsDataCopy(
          req.params.id,
          req.body.targetParentId,
          req.body.orderIndex,
        );
        return res.status(201).send(copy.toTransportJson());
      } catch (err) {
        return res.status(400).send({ error: err.message });
      }
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
      if (!(await CheckBookAccess(req, res, section.bookId, "write"))) return;
      if (section.parentId === null) {
        return res.status(400).send({ error: "Cannot delete root section" });
      }
      await SectionsDataDelete(req.params.id, section.bookId);
      return res.status(200).send({});
    });
  }
}
