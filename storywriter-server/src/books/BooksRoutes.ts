import { FastifyInstance, RequestGenericInterface } from "fastify";
import * as fs from "fs";
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
import { DeleteBookStorage, BookMediaDir } from "./BookFiles";
import {
  BookManuscriptCompile,
  ManuscriptTooLargeError,
  MediaFileLoader,
  ManuscriptInclude,
  RenderManuscriptDocx,
  RenderManuscriptEpub,
  RenderManuscriptMarkdown,
} from "./BookManuscript";
import { Config } from "../Config";
import { SafeJoin } from "../utils/SafePath";
import { ImportValidationError } from "./BookArchiveValidation";
import { Property } from "../model/Property";
import {
  PropertiesDataAdd,
  PropertiesDataGetAllSectionValuesForBook,
  PropertiesDataListByBook,
} from "../properties/PropertiesData";
import { MediaDataList } from "../media/MediaData";
import {
  VersionsDataListByBook,
  VersionsDataGet,
  VersionsDataGetMeta,
  VersionsDataCreate,
  VersionsDataRestore,
} from "../versions/VersionsData";
import {
  ImportExportAcquire,
  ImportExportRelease,
} from "../utils/RequestLimits";

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

      const permission = await BookAccessGet(req, book, userSession);
      return res.status(201).send({ ...book.toTransportJson(), permission });
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
      const permission = await BookAccessGet(req, book, userSession);
      return res.status(200).send({ ...book.toTransportJson(), permission });
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
      // Remove media, version media and the analysis cache after the DB
      // delete; failures are logged by DeleteBookStorage but don't fail the
      // request (the database is the source of truth).
      await DeleteBookStorage(req.params.id, config);
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
        req.log.error(err);
        return res
          .status(500)
          .send({ error: "Version creation failed" });
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
      const version = await VersionsDataGetMeta(req.params.versionId);
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
          req.log.error(err);
          return res.status(500).send({ error: "Restore failed" });
        }
      },
    );

    // ==================== EXPORT BOOK ====================
    interface ExportBook extends RequestGenericInterface {
      Params: { id: string };
      Querystring: { format?: string; include?: string };
    }
    fastify.get<ExportBook>("/:id/export", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
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
      if (!ImportExportAcquire(userSession.userId, config)) {
        return res.status(429).send({
          error: "Too many import/export operations, try again shortly",
        });
      }
      try {
        if (format === "targz") {
          // Build the archive fully before touching the response: if the
          // export fails we can still send a proper JSON error, and archive
          // errors can never corrupt already-sent headers.
          const tmpFile = await BookExportRun(req.params.id, config);
          const safeName = SafeExportFilename(book.name);
          res.header("Content-Type", "application/gzip");
          res.header(
            "Content-Disposition",
            `attachment; filename="${safeName}.tar.gz"`,
          );
          res.header("X-Filename", `${safeName}.tar.gz`);
          // Stream the temp file; clean it up when the transfer is done.
          const stream = fs.createReadStream(tmpFile);
          const cleanup = () => {
            fs.promises.unlink(tmpFile).catch(() => undefined);
          };
          stream.on("close", cleanup);
          stream.on("error", (err) => {
            cleanup();
            // Destroying the response is all we can do here: headers are
            // already sent. Never throw from a stream callback.
            req.log.error(`Export stream failed: ${err.message}`);
            res.raw.destroy();
          });
          return res.send(stream);
        }

        // Manuscript formats: compile the book in tree order, bounded by
        // content and media budgets so huge books fail with a clear 413
        // instead of buffering the server to death.
        const sections = await SectionsDataListByBook(book.id);
        const contentBytes = sections.reduce(
          (sum, s) =>
            sum +
            Buffer.byteLength(s.title || "") +
            Buffer.byteLength(s.content || "") +
            Buffer.byteLength(s.analysis || ""),
          0,
        );
        if (contentBytes > config.EXPORT_MAX_CONTENT_BYTES) {
          throw new ManuscriptTooLargeError(
            "Book content exceeds the export size limit",
          );
        }
        const mediaItems = await MediaDataList(book.id);
        const mediaById = new Map(mediaItems.map((m) => [m.id, m]));
        let mediaBytesLoaded = 0;
        const loadMediaFile: MediaFileLoader = async (mediaBookId, mediaId) => {
          const media = mediaById.get(mediaId);
          if (!media) {
            return null;
          }
          if (mediaBytesLoaded + media.size > config.EXPORT_MAX_TOTAL_MEDIA_BYTES) {
            throw new ManuscriptTooLargeError(
              "Book media exceeds the export size limit",
            );
          }
          try {
            const filePath = SafeJoin(
              BookMediaDir(config, mediaBookId),
              mediaId,
              media.filename,
            );
            const buffer = await fs.promises.readFile(filePath);
            mediaBytesLoaded += buffer.length;
            if (mediaBytesLoaded > config.EXPORT_MAX_TOTAL_MEDIA_BYTES) {
              throw new ManuscriptTooLargeError(
                "Book media exceeds the export size limit",
              );
            }
            return { buffer, mimeType: media.mimeType };
          } catch (err) {
            if (err instanceof ManuscriptTooLargeError) {
              throw err;
            }
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
            // One bulk query for the whole book, joined in memory.
            const values = await PropertiesDataGetAllSectionValuesForBook(
              book.id,
            );
            for (const value of values) {
              if (value.propertyId !== typeProperty.id) continue;
              const labels = value.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
              if (labels.length > 0) {
                sectionLabels[value.sectionId] = labels;
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

        if (format === "docx") {
          const buffer = await RenderManuscriptDocx(compiled, book);
          res.header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          );
          res.header(
            "Content-Disposition",
            `attachment; filename="${safeName}.docx"`,
          );
          res.header("X-Filename", `${safeName}.docx`);
          return res.send(buffer);
        }

        // EPUB: rendered to a temp file and streamed, so the archive is never
        // buffered in memory on top of the compiled content.
        const tmpFile = await RenderManuscriptEpub(
          compiled,
          book,
          config.TMP_DIR,
        );
        res.header("Content-Type", "application/epub+zip");
        res.header(
          "Content-Disposition",
          `attachment; filename="${safeName}.epub"`,
        );
        res.header("X-Filename", `${safeName}.epub`);
        const stream = fs.createReadStream(tmpFile);
        const cleanup = () => {
          fs.promises.unlink(tmpFile).catch(() => undefined);
        };
        stream.on("close", cleanup);
        stream.on("error", (err) => {
          cleanup();
          req.log.error(`Export stream failed: ${err.message}`);
          res.raw.destroy();
        });
        return res.send(stream);
      } catch (err) {
        if (err instanceof ManuscriptTooLargeError) {
          return res
            .status(413)
            .send({ error: `Book too large to export as ${format}` });
        }
        req.log.error(err);
        return res.status(500).send({ error: "Export failed" });
      } finally {
        ImportExportRelease(userSession.userId);
      }
    });

    // ==================== IMPORT BOOK ====================
    fastify.post("/import", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!ImportExportAcquire(userSession.userId, config)) {
        return res.status(429).send({
          error: "Too many import/export operations, try again shortly",
        });
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
        return res.status(201).send(book.toTransportJson());
      } catch (err) {
        if (err instanceof ImportValidationError) {
          return res.status(400).send({ error: err.message });
        }
        if (
          (err as Error).message?.includes("FST_REQ_FILE_TOO_LARGE") ||
          (err as any).code === "FST_REQ_FILE_TOO_LARGE"
        ) {
          return res.status(413).send({ error: "Archive too large" });
        }
        req.log.error(err);
        return res.status(500).send({ error: "Import failed" });
      } finally {
        ImportExportRelease(userSession.userId);
      }
    });
  }
}
