import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Property } from "../model/Property";
import { AuthGetUserSession } from "../users/Auth";
import { BooksDataGetUserAccess } from "../books/BooksData";
import { SectionsDataGet } from "../sections/SectionsData";
import {
  PropertiesDataAdd,
  PropertiesDataDelete,
  PropertiesDataGet,
  PropertiesDataGetSectionValues,
  PropertiesDataListByBook,
  PropertiesDataRemoveSectionValue,
  PropertiesDataSetSectionValue,
  PropertiesDataUpdate,
} from "./PropertiesData";

export class PropertiesRoutes {
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

    // ==================== LIST PROPERTIES BY BOOK ====================
    interface ListByBook extends RequestGenericInterface {
      Querystring: { bookId: string };
    }
    fastify.get<ListByBook>("/", async (req, res) => {
      const bookId = req.query?.bookId;
      if (!bookId) {
        return res.status(400).send({ error: "Missing: bookId" });
      }
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const properties = await PropertiesDataListByBook(bookId);
      return res.status(200).send(properties.map((p) => p.toTransportJson()));
    });

    // ==================== CREATE PROPERTY ====================
    interface PostProperty extends RequestGenericInterface {
      Body: { bookId: string; name: string; options?: string[] };
    }
    fastify.post<PostProperty>("/", async (req, res) => {
      if (!(await checkBookAccess(req, res, req.body.bookId, "write"))) return;
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: name" });
      }
      const property = new Property();
      property.bookId = req.body.bookId;
      property.name = req.body.name;
      property.options = req.body.options || [];
      await PropertiesDataAdd(property);
      return res.status(201).send(property.toTransportJson());
    });

    // ==================== UPDATE PROPERTY ====================
    interface PutProperty extends RequestGenericInterface {
      Params: { id: string };
      Body: { name?: string; options?: string[] };
    }
    fastify.put<PutProperty>("/:id", async (req, res) => {
      const property = await PropertiesDataGet(req.params.id);
      if (!property) {
        return res.status(404).send({ error: "Property Not Found" });
      }
      if (!(await checkBookAccess(req, res, property.bookId, "write"))) return;
      if (req.body.name !== undefined) property.name = req.body.name;
      if (req.body.options !== undefined) property.options = req.body.options;
      await PropertiesDataUpdate(property);
      return res.status(200).send(property.toTransportJson());
    });

    // ==================== DELETE PROPERTY ====================
    interface DeleteProperty extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteProperty>("/:id", async (req, res) => {
      const property = await PropertiesDataGet(req.params.id);
      if (!property) {
        return res.status(404).send({ error: "Property Not Found" });
      }
      if (!(await checkBookAccess(req, res, property.bookId, "write"))) return;
      await PropertiesDataDelete(req.params.id);
      return res.status(200).send({});
    });

    // ==================== SECTION PROPERTY VALUES ====================

    // Get values for a section
    interface GetSectionValues extends RequestGenericInterface {
      Params: { sectionId: string };
    }
    fastify.get<GetSectionValues>("/section/:sectionId", async (req, res) => {
      const section = await SectionsDataGet(req.params.sectionId);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "read"))) return;
      const values = await PropertiesDataGetSectionValues(req.params.sectionId);
      return res.status(200).send(values);
    });

    // Set value for a section property
    interface PutSectionValue extends RequestGenericInterface {
      Params: { sectionId: string };
      Body: { propertyId: string; value: string };
    }
    fastify.put<PutSectionValue>("/section/:sectionId", async (req, res) => {
      const section = await SectionsDataGet(req.params.sectionId);
      if (!section) {
        return res.status(404).send({ error: "Section Not Found" });
      }
      if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
      await PropertiesDataSetSectionValue(
        req.params.sectionId,
        req.body.propertyId,
        req.body.value,
      );
      return res.status(200).send({});
    });

    // Remove value for a section property
    interface DeleteSectionValue extends RequestGenericInterface {
      Params: { sectionId: string; propertyId: string };
    }
    fastify.delete<DeleteSectionValue>(
      "/section/:sectionId/:propertyId",
      async (req, res) => {
        const section = await SectionsDataGet(req.params.sectionId);
        if (!section) {
          return res.status(404).send({ error: "Section Not Found" });
        }
        if (!(await checkBookAccess(req, res, section.bookId, "write"))) return;
        await PropertiesDataRemoveSectionValue(
          req.params.sectionId,
          req.params.propertyId,
        );
        return res.status(200).send({});
      },
    );
  }
}
