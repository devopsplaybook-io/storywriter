import { FastifyInstance, RequestGenericInterface } from "fastify";
import { promises as fs } from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { CheckBookAccess } from "../books/BookAccess";
import { BookMediaDir } from "../books/BookFiles";
import { SafeJoin, IsSafePathSegment } from "../utils/SafePath";
import {
  IsAllowedMimeType,
  GenerateMediaFilename,
  MatchesMagicBytes,
  SanitizeOriginalFilename,
} from "./MediaValidation";
import {
  MediaDataList,
  MediaDataGet,
  MediaDataAdd,
  MediaDataUpdate,
  MediaDataDelete,
  MediaDataGetBySlug,
  MediaDataCreateNew,
} from "./MediaData";

// Raster images can be shown inline; SVG can contain scripts so it is always
// offered as a download. All responses carry nosniff.
const INLINE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export class MediaRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;

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
      if (!(await CheckBookAccess(req, res, bookId, "read"))) return;
      const mediaList = await MediaDataList(bookId);
      return res.status(200).send(mediaList);
    });

    // ==================== GET SINGLE MEDIA ====================
    interface GetMedia extends RequestGenericInterface {
      Params: { bookId: string; id: string };
    }
    fastify.get<GetMedia>("/:bookId/media/:id", async (req, res) => {
      const { bookId, id } = req.params;
      if (!(await CheckBookAccess(req, res, bookId, "read"))) return;
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
      if (!(await CheckBookAccess(req, res, bookId, "read"))) return;
      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }
      if (!IsAllowedMimeType(media.mimeType)) {
        return res
          .status(415)
          .send({ error: "Unsupported media type" });
      }
      if (!IsSafePathSegment(media.filename)) {
        return res.status(404).send({ error: "File Not Found" });
      }
      const mediaDir = BookMediaDir(config, bookId);
      const filePath = SafeJoin(mediaDir, id, media.filename);
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).send({ error: "File Not Found" });
      }
      res.header("X-Content-Type-Options", "nosniff");
      res.header(
        "Content-Disposition",
        `${INLINE_MIME_TYPES.includes(media.mimeType) ? "inline" : "attachment"}; filename="${(media.originalFilename || media.filename).replace(/"/g, "")}"`,
      );
      return res.sendFile(media.filename, path.join(mediaDir, id));
    });

    // ==================== UPLOAD MEDIA ====================
    interface UploadMedia extends RequestGenericInterface {
      Params: { bookId: string };
    }
    fastify.post<UploadMedia>("/:bookId/media", async (req, res) => {
      const bookId = req.params.bookId;
      if (!(await CheckBookAccess(req, res, bookId, "write"))) return;

      const data = await req.file();
      if (!data) {
        return res.status(400).send({ error: "No file uploaded" });
      }

      // Validate mime type with the shared allow-list (images only)
      if (!IsAllowedMimeType(data.mimetype)) {
        return res
          .status(400)
          .send({ error: "Invalid file type. Only images are allowed." });
      }

      // Read file buffer and verify the content matches the declared type
      const buffer = await data.toBuffer();
      if (!MatchesMagicBytes(buffer, data.mimetype)) {
        return res.status(400).send({
          error: "Invalid file content. It does not match the declared type.",
        });
      }
      const size = buffer.length;

      // Generate media ID and slug; the storage filename is server-generated
      // and the original upload name is kept as display metadata only.
      const media = MediaDataCreateNew(
        bookId,
        "",
        "",
        SanitizeOriginalFilename(data.filename),
        data.mimetype,
        size,
      );
      media.filename = GenerateMediaFilename(media.id, data.mimetype);

      // Generate and ensure unique slug
      const baseSlug = generateSlug(data.filename);
      media.slug = await ensureUniqueSlug(bookId, baseSlug);

      // Create directory and save file (path derived from server-generated ids)
      const mediaDir = SafeJoin(BookMediaDir(config, bookId), media.id);
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
      if (!(await CheckBookAccess(req, res, bookId, "write"))) return;

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
      if (!(await CheckBookAccess(req, res, bookId, "write"))) return;

      const media = await MediaDataGet(id);
      if (!media || media.bookId !== bookId) {
        return res.status(404).send({ error: "Media Not Found" });
      }

      // Delete file from disk (server-generated ids only; a hostile id or
      // filename must never escape the book media dir)
      if (IsSafePathSegment(id) && IsSafePathSegment(bookId)) {
        const mediaDir = SafeJoin(BookMediaDir(config, bookId), id);
        try {
          await fs.rm(mediaDir, { recursive: true, force: true });
        } catch {
          // Directory might not exist, continue
        }
      }

      // Delete metadata from DB
      await MediaDataDelete(id);

      return res.status(200).send({ success: true });
    });
  }
}
