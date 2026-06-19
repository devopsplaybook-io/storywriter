import { FastifyInstance, RequestGenericInterface } from "fastify";
import { promises as fs } from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { AuthGetUserSession } from "../users/Auth";
import { BooksDataGetUserAccess } from "../books/BooksData";
import {
  MediaDataList,
  MediaDataGet,
  MediaDataAdd,
  MediaDataUpdate,
  MediaDataDelete,
  MediaDataGetBySlug,
  MediaDataCreateNew,
} from "./MediaData";

export class MediaRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;

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

    // Helper: get media directory path
    function getMediaDir(bookId: string, mediaId: string): string {
      return path.join(config.DATA_DIR, "media", bookId, mediaId);
    }

    // Helper: sanitize filename
    function sanitizeFilename(filename: string): string {
      return filename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 200);
    }

    // Helper: generate slug from filename
    function generateSlug(filename: string): string {
      // Remove extension
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
      return nameWithoutExt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 150);
    }

    // Helper: ensure slug uniqueness
    async function ensureUniqueSlug(
      bookId: string,
      slug: string,
    ): Promise<string> {
      let candidate = slug;
      let counter = 1;
      while (await MediaDataGetBySlug(bookId, candidate)) {
        candidate = `${slug}-${counter}`;
        counter++;
      }
      return candidate;
    }

    // ==================== LIST MEDIA BY BOOK ====================
    interface ListMedia extends RequestGenericInterface {
      Params: { bookId: string };
    }
    fastify.get<ListMedia>("/:bookId/media", async (req, res) => {
      const bookId = req.params.bookId;
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const mediaList = await MediaDataList(bookId);
      return res.status(200).send(mediaList);
    });

    // ==================== GET SINGLE MEDIA ====================
    interface GetMedia extends RequestGenericInterface {
      Params: { bookId: string; id: string };
    }
    fastify.get<GetMedia>("/:bookId/media/:id", async (req, res) => {
      const { bookId, id } = req.params;
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }
      return res.status(200).send(media);
    });

    // ==================== GET MEDIA FILE ====================
    interface GetMediaFile extends RequestGenericInterface {
      Params: { bookId: string; id: string };
    }
    fastify.get<GetMediaFile>("/:bookId/media/:id/file", async (req, res) => {
      const { bookId, id } = req.params;
      if (!(await checkBookAccess(req, res, bookId, "read"))) return;
      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }
      const mediaDir = getMediaDir(bookId, id);
      const filePath = path.join(mediaDir, media.filename);
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).send({ error: "File Not Found" });
      }
      return res.sendFile(filePath);
    });

    // ==================== UPLOAD MEDIA ====================
    interface UploadMedia extends RequestGenericInterface {
      Params: { bookId: string };
    }
    fastify.post<UploadMedia>("/:bookId/media", async (req, res) => {
      const bookId = req.params.bookId;
      if (!(await checkBookAccess(req, res, bookId, "write"))) return;

      const data = await req.file();
      if (!data) {
        return res.status(400).send({ error: "No file uploaded" });
      }

      // Validate mime type (images only)
      const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
      ];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        return res
          .status(400)
          .send({ error: "Invalid file type. Only images are allowed." });
      }

      // Read file buffer
      const buffer = await data.toBuffer();
      const size = buffer.length;

      // Generate media ID, sanitize filename, generate slug
      const media = MediaDataCreateNew(
        bookId,
        "",
        sanitizeFilename(data.filename),
        data.mimetype,
        size,
      );

      // Generate and ensure unique slug
      const baseSlug = generateSlug(data.filename);
      media.slug = await ensureUniqueSlug(bookId, baseSlug);

      // Create directory and save file
      const mediaDir = getMediaDir(bookId, media.id);
      await fs.mkdir(mediaDir, { recursive: true });
      const filePath = path.join(mediaDir, media.filename);
      await fs.writeFile(filePath, buffer);

      // Save metadata to DB
      await MediaDataAdd(media);

      return res.status(201).send(media);
    });

    // ==================== UPDATE MEDIA SLUG ====================
    interface UpdateMedia extends RequestGenericInterface {
      Params: { bookId: string; id: string };
      Body: { slug?: string };
    }
    fastify.put<UpdateMedia>("/:bookId/media/:id", async (req, res) => {
      const { bookId, id } = req.params;
      if (!(await checkBookAccess(req, res, bookId, "write"))) return;

      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }

      const { slug } = req.body || {};
      if (!slug || typeof slug !== "string") {
        return res.status(400).send({ error: "Missing or invalid slug" });
      }

      // Sanitize slug
      const sanitizedSlug = slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 150);

      if (!sanitizedSlug) {
        return res.status(400).send({ error: "Invalid slug" });
      }

      // Check uniqueness (excluding current media)
      const existing = await MediaDataGetBySlug(bookId, sanitizedSlug);
      if (existing && existing.id !== id) {
        return res.status(409).send({ error: "Slug already exists" });
      }

      await MediaDataUpdate(id, { slug: sanitizedSlug });
      const updated = await MediaDataGet(id);
      return res.status(200).send(updated);
    });

    // ==================== DELETE MEDIA ====================
    interface DeleteMedia extends RequestGenericInterface {
      Params: { bookId: string; id: string };
    }
    fastify.delete<DeleteMedia>("/:bookId/media/:id", async (req, res) => {
      const { bookId, id } = req.params;
      if (!(await checkBookAccess(req, res, bookId, "write"))) return;

      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }

      // Delete file from disk
      const mediaDir = getMediaDir(bookId, id);
      try {
        await fs.rm(mediaDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist, continue
      }

      // Delete metadata from DB
      await MediaDataDelete(id);

      return res.status(200).send({ success: true });
    });
  }
}
