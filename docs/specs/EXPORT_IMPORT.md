# Export / Import

- [x] Export a book as a tar.gz archive
- [x] Import a book from a tar.gz archive
- [x] Versioned manifest inside the archive (currently `2.0`; the importer also accepts `1.0`)
- [x] Export available from the book list (export icon on each card opens a dialog)
- [x] Import available from the book list header (Import button)
- [x] Export the book as a **single Markdown** manuscript compiled in tree order (YAML front matter, sections as headings, media embedded as data URIs)
- [x] Export the book as a **DOCX** manuscript generated server-side from the same compilation
- [x] Export the book as an **EPUB 3** e-book generated server-side from the same compilation (one chapter file per depth-1 section)
- [x] Export dialog on the book card offers a format choice (Backup tar.gz / Markdown / Word / EPUB)
- [x] Include choice for manuscript formats: content only (default) or with AI notes and section type labels
- [x] `tar.gz` stays the backup format (unchanged): full archive with manifest, re-importable
- [x] Import is **atomic**: a failed import leaves no book rows, no media files and no temp directory; invalid archives return `400`
- [x] Import validation: entry allow-list, extraction limits (count/size/gzip ratio), section tree checks, media MIME/magic-byte/size checks, traversal-safe filenames
- [x] **Size budgets for manuscript exports**: total section content (title + content + AI notes) is capped at `EXPORT_MAX_CONTENT_BYTES` (default 20 MiB) and total embedded media at `EXPORT_MAX_TOTAL_MEDIA_BYTES` (default 100 MiB); exceeding either returns `413` instead of buffering an unbounded book
- [x] **Concurrency guard**: exports and imports run at most `IMPORT_EXPORT_CONCURRENCY` (default 2) per user; excess requests return `429`
- [x] Property labels for `include=full` are gathered with **one bulk query** for the whole book instead of one query per section

## Archive Format

The export produces a **tar.gz** archive containing:

```
manifest.json              — version + metadata
book.json                  — book record (id, name, description, dateCreated)
sections.json              — array of section records (including the `analysis` AI notes)
attributes.json            — array of book attribute records
properties.json            — array of book property definitions
section-properties.json    — array of { sectionId, propertyId, value }
media-metadata.json        — array of media metadata records
media/<mediaId>/<filename> — binary media files
```

The legacy `section-versions.json` and `attribute-versions.json` files (documented
by export `1.0` before the version tables were dropped) are **tolerated and
ignored** on import; the current exporter does not emit them.

### Manifest

```json
{
  "version": "2.0",
  "exportedAt": "2025-06-18T12:00:00.000Z",
  "bookName": "My Book"
}
```

The `version` field allows future export format changes. The importer accepts
`1.0` and `2.0` and rejects anything else with a `400` listing the supported
versions. `1.0` archives import through the same code path (missing optional
fields fall back to defaults).

## What Data Is Included

| Data                                                     | Included                        |
| -------------------------------------------------------- | ------------------------------- |
| Book metadata (name, description)                        | Yes                             |
| Sections (title, content, type, mediaId, caption, order) | Yes                             |
| Section AI notes (`analysis`)                            | Yes                             |
| Book attributes (title, content)                         | Yes                             |
| Property definitions (name, type, options)               | Yes                             |
| Section property values                                  | Yes                             |
| Media metadata (slug, filename, originalFilename, mimeType, size) | Yes                    |
| Media files (binary)                                     | Yes                             |
| Book access control                                      | No (importer becomes owner)     |
| Book analysis (report)                                   | No (can be regenerated)         |
| Section/attribute version history                        | No (tables dropped in init-0002)|

## Import Behavior

- A **new book** is created with a new UUID. The original book ID is not preserved.
- All child records (sections, attributes, properties, media) receive **new UUIDs**.
- ID mappings are maintained so that parent-child relationships, section-media references, and section-property associations are preserved.
- Media files are copied to `DATA_DIR/media/<newBookId>/<newMediaId>/<filename>` where `<filename>` is **server-generated** (`<mediaId>.<validated extension>`); the display name is kept in `media.originalFilename`.
- The importing user becomes the book's **owner** (`ownerId`) and is granted **write access** inside the same transaction.
- The original `dateCreated` of the book is preserved.
- The whole import runs in a **single database transaction** (book, sections, attributes, properties, section values, media, access grant): any failure rolls everything back, staged media files and the temp directory are removed, and the caller receives an error.

### Import validation and limits

Invalid archives are rejected with `400` and a descriptive error:

- Only the documented entry names are allowed (plus `media/<mediaId>/<filename>`); links, unexpected directories and unknown entries are rejected.
- Limits: max **5000 entries**, **200 MiB** total uncompressed, **10 MiB** per media file, **20 MiB** per JSON file, gzip decompression ratio ≤ **200**.
- Section tree: unique ids, exactly one root, all parents resolvable, no cycles; `type` ∈ {text, container, media}; media references must exist in the archive.
- Media metadata: unique ids, allow-listed MIME type (JPEG/PNG/GIF/WebP/SVG), safe single-segment filename, declared size must match the actual archive entry; file content must match its declared MIME type (magic bytes); HTML/SVG-content smuggling is rejected.
- Traversal filenames (`../..`, absolute paths, backslashes, NUL bytes) are rejected; archive-provided names are never used as filesystem paths.

## Manuscript Export Formats

The three manuscript formats (single Markdown, DOCX, EPUB) are compiled from the same server-side compilation of the book:

- Sections are walked **in tree order** from the root; children are sorted by `orderIndex`.
- The root container itself is never rendered; depth 1 sections become level-1 headings, deeper sections map to `h2`–`h6`.
- `book.name` is the document title and `book.description` the description (YAML front matter in Markdown, metadata in DOCX/EPUB).
- Text sections render their heading and content markdown; media sections render their heading, image and caption; containers render their heading only.
- Media referenced by slug in content (with or without extension, matching the in-app preview) and media sections are **embedded**: base64 data URIs in Markdown/DOCX, zip resources in EPUB. Missing media files become a `[missing image: <slug|id>]` placeholder instead of failing the export.
- `include=content` (default) produces a clean manuscript; `include=full` additionally appends, per section, the section type labels as an italic "Labels:" line and the AI notes under an "AI Notes" heading.
- EPUB 3 structure: `mimetype` (stored first), `META-INF/container.xml`, `content.opf`, `nav.xhtml` + `toc.ncx`, one XHTML file per depth-1 section and a small stylesheet.

## API Endpoints

### Export

```
GET /api/books/:id/export?format=targz|markdown|docx|epub&include=content|full
```

- Requires authentication and read access to the book.
- `format` (default `targz`):
  - `targz` — backup archive (`application/gzip`, headers below). The archive is built into a temporary file first; a failed export returns a `500` JSON error **before** any header is sent (stable message, cause only logged), and a missing DB-referenced media file fails the export loudly instead of producing an incomplete backup.
  - `markdown` — single Markdown manuscript (`text/markdown; charset=utf-8`).
  - `docx` — Word manuscript (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - `epub` — EPUB 3 e-book (`application/epub+zip`), rendered to a temporary file and **streamed** to the client so the archive is never fully buffered in memory.
- `include` (default `content`, ignored for `targz`): `content` = manuscript only; `full` = manuscript with AI notes and section type labels per section.
- Unknown `format`/`include` values return `400`; books over the content/media size budgets return `413`.
- Response headers (`Content-Disposition` and `X-Filename`) carry a safe file name with the matching extension: `.tar.gz`, `.md`, `.docx` or `.epub`.
- Archive/stream errors never crash the process: the temp file is removed and the connection closed.

### Import

```
POST /api/books/import
```

- Requires authentication.
- Accepts a multipart file upload (`file` field), capped at 10 MiB compressed by `@fastify/multipart` (`413` when exceeded).
- Concurrency-limited per user like exports (`429` when exceeded).
- Returns `201 Created` with the new book JSON.
- Invalid or hostile archives return `400`; unexpected failures return a stable `500` ("Import failed") and leave no traces.
- The importing user automatically becomes owner and gets write access to the new book.

## Implementation

| Layer         | File                                           |
| ------------- | ---------------------------------------------- |
| Server logic  | `src/books/BookExport.ts`                      |
| Server routes | `src/books/BooksRoutes.ts`                     |
| Server validation | `src/books/BookArchiveValidation.ts`, `src/utils/SafePath.ts`, `src/media/MediaValidation.ts` |
| Server compile/render | `src/books/BookManuscript.ts` (tree compile + Markdown/DOCX/EPUB renderers) |
| Web store     | `stores/books.ts` (`exportBook`, `importBook`) |
| Web UI - card | `components/BookCard.vue` (export icon)        |
| Web UI - dialog | `components/BookExportDialog.vue` (format + include choice) |
| Web UI - page | `pages/index.vue` (import button + handler)    |

## Dependencies

- `archiver` — creates tar.gz archives (TarArchive class) and the EPUB 3 zip (ZipArchive class)
- `tar` — lists and extracts tar.gz archives on import (entry filter, strict mode, decompression-ratio limit)
- `marked` — markdown → HTML for the DOCX/EPUB renderers
- `@turbodocx/html-to-docx` — HTML → DOCX Buffer for the DOCX renderer

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-25_
