import { FastifyInstance, RequestGenericInterface } from "fastify";
import * as fs from "fs";
import * as path from "path";
import { AuthGetUserSession } from "@devopsplaybook.io/common-utils";
import { Book } from "../model/Book";
import {
  BooksDataAdd,
  BooksDataDelete,
  BooksDataGet,
  BooksDataGetAccess,
  BooksDataGetPermissionsForUser,
  BooksDataList,
  BooksDataListForUser,
  BooksDataRemoveAccess,
  BooksDataSetAccess,
  BooksDataUpdate,
} from "./BooksData";
import {
  BookAccessGet,
  CheckBookAccess,
  CheckBookOwnerOrAdmin,
} from "./BookAccess";
import {
  SectionsDataAddRootSection,
  SectionsDataListByBook,
} from "../sections/SectionsData";
import { BookExportRun, BookImportRun } from "./BookExport";
import {
  BookManuscriptCompile,
  MediaFileLoader,
  ManuscriptInclude,
  RenderManuscriptDocx,
  RenderManuscriptEpub,
  RenderManuscriptMarkdown,
} from "./BookManuscript";
import { Config } from "../Config";
import { Property } from "../model/Property";
import {
  PropertiesDataAdd,
  PropertiesDataGetSectionValues,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";
import { MediaDataList } from "../media/MediaData";
import {
  VersionsDataListByBook,
  VersionsDataGet,
  VersionsDataCreate,
  VersionsDataRestore,
} from "../versions/VersionsData";

function SafeExportFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

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
      let permissions: Record<string, "read" | "write"> = {};
      if (userSession.role === "admin") {
        books = await BooksDataList();
      } else {
        books = await BooksDataListForUser(userSession.userId);
        permissions = await BooksDataGetPermissionsForUser(userSession.userId);
      }
      return res.status(200).send(
        books.map((b) => {
          let permission: string | null;
          if (userSession.role === "admin") {
            permission = "admin";
          } else if (b.ownerId === userSession.userId) {
            permission = "owner";
          } else {
            permission = permissions[b.id] || null;
          }
          return { ...b.toTransportJson(), permission };
        }),
      );
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
      const permission = await BookAccessGet(req, book, userSession);
      if (!permission) {
        return res.status(403).send({ error: "Access Denied" });
      }
      return res
        .status(200)
        .send({ ...book.toTransportJson(), permission });
    });

    // ==================== CREATE BOOK ====================
    interface PostBook extends RequestGenericInterface {
      Body: { name: string; description?: string; writingGoal?: number };
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
      book.writingGoal = Math.max(0, Math.floor(Number(req.body.writingGoal) || 0));
      book.ownerId = userSession.userId;
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
      Body: { name?: string; description?: string; writingGoal?: number };
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
      if (!(await CheckBookAccess(req, res, req.params.id, "write", book)))
        return;

      if (req.body.name !== undefined) book.name = req.body.name;
      if (req.body.description !== undefined)
        book.description = req.body.description;
      if (req.body.writingGoal !== undefined)
        book.writingGoal = Math.max(
          0,
          Math.floor(Number(req.body.writingGoal) || 0),
        );
      await BooksDataUpdate(book);
      return res.status(200).send(book.toTransportJson());
    });

    // ==================== DELETE BOOK ====================
    interface DeleteBook extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteBook>("/:id", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookOwnerOrAdmin(req, res, req.params.id, book))) return;
      await BooksDataDelete(req.params.id);
      return res.status(200).send({});
    });

    // ==================== BOOK ACCESS ====================

    // Get access list for a book
    interface GetAccess extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.get<GetAccess>("/:id/access", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookOwnerOrAdmin(req, res, req.params.id, book))) return;
      const access = await BooksDataGetAccess(req.params.id);
      return res.status(200).send(access);
    });

    // Set access for a user on a book
    interface PutAccess extends RequestGenericInterface {
      Params: { id: string };
      Body: { userId: string; permission: "read" | "write" };
    }
    fastify.put<PutAccess>("/:id/access", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookOwnerOrAdmin(req, res, req.params.id, book))) return;
      if (!req.body.userId || !req.body.permission) {
        return res.status(400).send({ error: "Missing: userId or permission" });
      }
      if (
        req.body.permission !== "read" &&
        req.body.permission !== "write"
      ) {
        return res.status(400).send({ error: "Invalid: permission" });
      }
      if (book.ownerId && req.body.userId === book.ownerId) {
        return res.status(400).send({ error: "Cannot change owner access" });
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
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookOwnerOrAdmin(req, res, req.params.id, book))) return;
      if (book.ownerId && req.params.userId === book.ownerId) {
        return res.status(400).send({ error: "Cannot remove owner access" });
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
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "write", book)))
        return;
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
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "read", book)))
        return;
      const versions = await VersionsDataListByBook(req.params.id);
      return res.status(200).send(versions.map((v) => v.toTransportJson()));
    });

    // Get specific version (metadata only, no snapshot)
    interface GetVersion extends RequestGenericInterface {
      Params: { id: string; versionId: string };
    }
    fastify.get<GetVersion>("/:id/versions/:versionId", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "read", book)))
        return;
      const version = await VersionsDataGet(req.params.versionId);
      if (!version || version.bookId !== req.params.id) {
        return res.status(404).send({ error: "Version Not Found" });
      }
      return res.status(200).send(version.toTransportJson());
    });

    // Get the snapshot of a specific version
    interface GetVersionSnapshot extends RequestGenericInterface {
      Params: { id: string; versionId: string };
    }
    fastify.get<GetVersionSnapshot>(
      "/:id/versions/:versionId/snapshot",
      async (req, res) => {
        const book = await BooksDataGet(req.params.id);
        if (!book) {
          return res.status(404).send({ error: "Book Not Found" });
        }
        if (!(await CheckBookAccess(req, res, req.params.id, "read", book)))
          return;
        const version = await VersionsDataGet(req.params.versionId);
        if (!version || version.bookId !== req.params.id) {
          return res.status(404).send({ error: "Version Not Found" });
        }
        return res.status(200).send({ snapshot: version.snapshot });
      },
    );

    // Restore version
    interface RestoreVersion extends RequestGenericInterface {
      Params: { id: string; versionId: string };
    }
    fastify.post<RestoreVersion>(
      "/:id/versions/:versionId/restore",
      async (req, res) => {
        const book = await BooksDataGet(req.params.id);
        if (!book) {
          return res.status(404).send({ error: "Book Not Found" });
        }
        if (!(await CheckBookAccess(req, res, req.params.id, "write", book)))
          return;
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
      Querystring: { format?: string; include?: string };
    }
    fastify.get<ExportBook>("/:id/export", async (req, res) => {
      const book = await BooksDataGet(req.params.id);
      if (!book) {
        return res.status(404).send({ error: "Book Not Found" });
      }
      if (!(await CheckBookAccess(req, res, req.params.id, "read", book)))
        return;
      const format = (req.query.format || "targz").toLowerCase();
      if (!["targz", "markdown", "docx", "epub"].includes(format)) {
        return res.status(400).send({ error: "Unknown export format" });
      }
      const include = (req.query.include || "content").toLowerCase();
      if (!["content", "full"].includes(include)) {
        return res.status(400).send({ error: "Unknown include option" });
      }
      try {
        if (format === "targz") {
          const archive = await BookExportRun(req.params.id, config);
          const safeName = SafeExportFilename(book.name);
          res.header("Content-Type", "application/gzip");
          res.header(
            "Content-Disposition",
            `attachment; filename="${safeName}.tar.gz"`,
          );
          res.header("X-Filename", `${safeName}.tar.gz`);
          // Pipe archive stream to response
          return res.send(archive);
        }

        // Manuscript formats: compile the book in tree order
        const sections = await SectionsDataListByBook(book.id);
        const mediaItems = await MediaDataList(book.id);
        const mediaById = new Map(mediaItems.map((m) => [m.id, m]));
        const loadMediaFile: MediaFileLoader = async (mediaBookId, mediaId) => {
          const media = mediaById.get(mediaId);
          if (!media) {
            return null;
          }
          try {
            const buffer = await fs.promises.readFile(
              path.join(
                config.DATA_DIR,
                "media",
                mediaBookId,
                mediaId,
                media.filename,
              ),
            );
            return { buffer, mimeType: media.mimeType };
          } catch {
            return null;
          }
        };
        let sectionLabels: Record<string, string[]> = {};
        if (include === "full") {
          const properties = await PropertiesDataListByBook(book.id);
          const typeProperty = properties.find(
            (p) => p.type === "section-type",
          );
          if (typeProperty) {
            for (const section of sections) {
              const values = await PropertiesDataGetSectionValues(section.id);
              const value = values.find(
                (v) => v.propertyId === typeProperty.id,
              )?.value;
              if (value) {
                const labels = value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
                if (labels.length > 0) {
                  sectionLabels[section.id] = labels;
                }
              }
            }
          }
        }
        const compiled = await BookManuscriptCompile(
          book,
          sections,
          mediaItems,
          loadMediaFile,
          { include: include as ManuscriptInclude },
          sectionLabels,
        );
        const safeName = SafeExportFilename(book.name);

        if (format === "markdown") {
          const markdown = RenderManuscriptMarkdown(compiled, book);
          res.header("Content-Type", "text/markdown; charset=utf-8");
          res.header(
            "Content-Disposition",
            `attachment; filename="${safeName}.md"`,
          );
          res.header("X-Filename", `${safeName}.md`);
          return res.send(markdown);
        }

        const buffer =
          format === "docx"
            ? await RenderManuscriptDocx(compiled, book)
            : await RenderManuscriptEpub(compiled, book);
        res.header(
          "Content-Type",
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/epub+zip",
        );
        res.header(
          "Content-Disposition",
          `attachment; filename="${safeName}.${format}"`,
        );
        res.header("X-Filename", `${safeName}.${format}`);
        return res.send(buffer);
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
        const book = await BookImportRun(
          buffer,
          config,
          userSession.userId,
        );

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
