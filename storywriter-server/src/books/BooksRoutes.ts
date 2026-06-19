import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Book } from "../model/Book";
import { AuthGetUserSession, AuthMustBeAdmin } from "../users/Auth";
import {
  BooksDataAdd,
  BooksDataDelete,
  BooksDataGet,
  BooksDataGetAccess,
  BooksDataGetUserAccess,
  BooksDataList,
  BooksDataListForUser,
  BooksDataRemoveAccess,
  BooksDataSetAccess,
  BooksDataUpdate,
} from "./BooksData";
import { SectionsDataAddRootSection } from "../sections/SectionsData";
import { BookExportRun, BookImportRun } from "./BookExport";
import { Config } from "../Config";
import { Property } from "../model/Property";
import { PropertiesDataAdd } from "../properties/PropertiesData";
import {
  VersionsDataListByBook,
  VersionsDataGet,
  VersionsDataCreate,
  VersionsDataRestore,
} from "../versions/VersionsData";

export class BooksRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;
    // ==================== LIST BOOKS ====================
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      let books: Book[];
      if (userSession.role === "admin") {
        books = await BooksDataList();
      } else {
        books = await BooksDataListForUser(userSession.userId);
      }
      return res.status(200).send(books.map((b) => b.toTransportJson()));
    });

    // ==================== GET BOOK ====================
    interface GetBook extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetBook>("/:id", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      return res.status(200).send(book.toTransportJson());
    });

    // ==================== CREATE BOOK ====================
    interface PostBook extends RequestGenericInterface {
      Body: { name: string; description?: string };
    }
    fastify.post<PostBook>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }

      const book = new Book();
      book.name = req.body.name;
      book.description = req.body.description || "";
      await BooksDataAdd(book);

      // Create root section for the book
      await SectionsDataAddRootSection(book.id);

      // Create default section types property
      const defaultProperty = new Property();
      defaultProperty.bookId = book.id;
      defaultProperty.name = "Section Types";
      defaultProperty.options = ["Chapter"];
      await PropertiesDataAdd(defaultProperty);

      // Give creator write access
      await BooksDataSetAccess(book.id, userSession.userId, "write");

      return res.status(201).send(book.toTransportJson());
    });

    // ==================== UPDATE BOOK ====================
    interface PutBook extends RequestGenericInterface {
      Params: { id: string };
      Body: { name?: string; description?: string };
    }
    fastify.put<PutBook>("/:id", async (req, res) => {
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

      if (req.body.name !== undefined) book.name = req.body.name;
      if (req.body.description !== undefined)
        book.description = req.body.description;
      await BooksDataUpdate(book);
      return res.status(200).send(book.toTransportJson());
    });

    // ==================== DELETE BOOK ====================
    interface DeleteBook extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteBook>("/:id", async (req, res) => {
      try {
        await AuthMustBeAdmin(req, res);
      } catch {
        return;
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      await BooksDataDelete(req.params.id);
      return res.status(200).send({});
    });

    // ==================== BOOK ACCESS ====================

    // Get access list for a book
    interface GetAccess extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetAccess>("/:id/access", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const access = await BooksDataGetAccess(req.params.id);
      return res.status(200).send(access);
    });

    // Set access for a user on a book
    interface PutAccess extends RequestGenericInterface {
      Params: { id: string };
      Body: { userId: string; permission: "read" | "write" };
    }
    fastify.put<PutAccess>("/:id/access", async (req, res) => {
      try {
        await AuthMustBeAdmin(req, res);
      } catch {
        return;
      }
      if (!req.body.userId || !req.body.permission) {
        return res.status(400).send({ error: "Missing: userId or permission" });
      }
      await BooksDataSetAccess(
        req.params.id,
        req.body.userId,
        req.body.permission,
      );
      return res.status(200).send({});
    });

    // Remove access for a user on a book
    interface DeleteAccess extends RequestGenericInterface {
      Params: { id: string; userId: string };
    }
    fastify.delete<DeleteAccess>("/:id/access/:userId", async (req, res) => {
      try {
        await AuthMustBeAdmin(req, res);
      } catch {
        return;
      }
      await BooksDataRemoveAccess(req.params.id, req.params.userId);
      return res.status(200).send({});
    });

    // ==================== BOOK VERSIONING ====================

    // Create version snapshot
    interface PostVersion extends RequestGenericInterface {
      Params: { id: string };
      Body: { note?: string };
    }
    fastify.post<PostVersion>("/:id/versions", async (req, res) => {
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
      const note = req.body?.note || "";
      try {
        const version = await VersionsDataCreate(req.params.id, note, config);
        return res.status(201).send(version.toTransportJson());
      } catch (err) {
        return res.status(500).send({
          error: `Version creation failed: ${err.message || "Unknown error"}`,
        });
      }
    });

    // List versions
    interface ListVersions extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<ListVersions>("/:id/versions", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      const versions = await VersionsDataListByBook(req.params.id);
      return res.status(200).send(versions.map((v) => v.toTransportJson()));
    });

    // Get specific version
    interface GetVersion extends RequestGenericInterface {
      Params: { id: string; versionId: string };
    }
    fastify.get<GetVersion>("/:id/versions/:versionId", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const version = await VersionsDataGet(req.params.versionId);
      if (!version || version.bookId !== req.params.id) {
        return res.status(404).send({ error: "Version Not Found" });
      }
      return res.status(200).send(version.toTransportJson());
    });

    // Restore version
    interface RestoreVersion extends RequestGenericInterface {
      Params: { id: string; versionId: string };
    }
    fastify.post<RestoreVersion>(
      "/:id/versions/:versionId/restore",
      async (req, res) => {
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
        const version = await VersionsDataGet(req.params.versionId);
        if (!version || version.bookId !== req.params.id) {
          return res.status(404).send({ error: "Version Not Found" });
        }
        try {
          await VersionsDataRestore(req.params.versionId, config);
          return res.status(200).send({ success: true });
        } catch (err) {
          return res.status(500).send({
            error: `Restore failed: ${err.message || "Unknown error"}`,
          });
        }
      },
    );

    // ==================== EXPORT BOOK ====================
    interface ExportBook extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<ExportBook>("/:id/export", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      // Check read access or admin
      if (userSession.role !== "admin") {
        const access = await BooksDataGetUserAccess(
          book.id,
          userSession.userId,
        );
        if (!access) {
          return res.status(403).send({ error: "Access Denied" });
        }
      }
      try {
        const archive = await BookExportRun(req.params.id, config);
        const safeName = book.name.replace(/[^a-zA-Z0-9-_]/g, "_");
        res.header("Content-Type", "application/gzip");
        res.header(
          "Content-Disposition",
          `attachment; filename="${safeName}.tar.gz"`,
        );
        res.header("X-Filename", `${safeName}.tar.gz`);
        // Pipe archive stream to response
        return res.send(archive);
      } catch (err) {
        return res.status(500).send({
          error: `Export failed: ${err.message || "Unknown error"}`,
        });
      }
    });

    // ==================== IMPORT BOOK ====================
    fastify.post("/import", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      try {
        const data = await req.file();
        if (!data) {
          return res.status(400).send({ error: "No file uploaded" });
        }
        const buffer = await data.toBuffer();
        const book = await BookImportRun(buffer, config);

        // Give importer write access
        await BooksDataSetAccess(book.id, userSession.userId, "write");

        return res.status(201).send(book.toTransportJson());
      } catch (err) {
        return res.status(500).send({
          error: `Import failed: ${err.message || "Unknown error"}`,
        });
      }
    });
  }
}
