# Export / Import

- [x] Export a book as a tar.gz archive
- [x] Import a book from a tar.gz archive
- [x] Versioned manifest inside the archive (currently `1.0`)
- [x] Export available from the book list (export icon on each card opens a dialog)
- [x] Import available from the book list header (Import button)
- [x] Export the book as a **single Markdown** manuscript compiled in tree order (YAML front matter, sections as headings, media embedded as data URIs)
- [x] Export the book as a **DOCX** manuscript generated server-side from the same compilation
- [x] Export the book as an **EPUB 3** e-book generated server-side from the same compilation (one chapter file per depth-1 section)
- [x] Export dialog on the book card offers a format choice (Backup tar.gz / Markdown / Word / EPUB)
- [x] Include choice for manuscript formats: content only (default) or with AI notes and section type labels
- [x] `tar.gz` stays the backup format (unchanged): full archive with manifest, re-importable

## Archive Format

The export produces a **tar.gz** archive containing:

```
manifest.json              — version + metadata
book.json                  — book record (id, name, description, dateCreated)
sections.json              — array of section records
section-versions.json      — array of section version records
attributes.json            — array of book attribute records
attribute-versions.json    — array of attribute version records
properties.json            — array of book property definitions
section-properties.json    — array of { sectionId, propertyId, value }
media-metadata.json        — array of media metadata records
media/<mediaId>/<filename> — binary media files
```

### Manifest

```json
{
  "version": "1.0",
  "exportedAt": "2025-06-18T12:00:00.000Z",
  "bookName": "My Book"
}
```

The `version` field allows future export format changes. The importer checks the version and rejects unsupported versions.

## What Data Is Included

| Data                                                     | Included                        |
| -------------------------------------------------------- | ------------------------------- |
| Book metadata (name, description)                        | Yes                             |
| Sections (title, content, type, mediaId, caption, order) | Yes                             |
| Section versions                                         | Yes                             |
| Book attributes (title, content)                         | Yes                             |
| Attribute versions                                       | Yes                             |
| Property definitions (name, type, options)               | Yes                             |
| Section property values                                  | Yes                             |
| Media metadata (slug, filename, mimeType, size)          | Yes                             |
| Media files (binary)                                     | Yes                             |
| Book access control                                      | No (importer gets write access) |
| Book analysis                                            | No (can be regenerated)         |

## Import Behavior

- A **new book** is created with a new UUID. The original book ID is not preserved.
- All child records (sections, attributes, properties, media) receive **new UUIDs**.
- ID mappings are maintained so that parent-child relationships, section-media references, and section-property associations are preserved.
- Media files are copied to `DATA_DIR/media/<newBookId>/<newMediaId>/<filename>`.
- The importing user is granted **write access** to the new book.
- The original `dateCreated` of the book is preserved.

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
  - `targz` — backup archive stream (unchanged, `application/gzip`, headers below).
  - `markdown` — single Markdown manuscript (`text/markdown; charset=utf-8`).
  - `docx` — Word manuscript (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - `epub` — EPUB 3 e-book (`application/epub+zip`).
- `include` (default `content`, ignored for `targz`): `content` = manuscript only; `full` = manuscript with AI notes and section type labels per section.
- Unknown `format`/`include` values return `400`.
- Response headers (`Content-Disposition` and `X-Filename`) carry a safe file name with the matching extension: `.tar.gz`, `.md`, `.docx` or `.epub`.

### Import

```
POST /api/books/import
```

- Requires authentication.
- Accepts a multipart file upload (`file` field).
- Returns `201 Created` with the new book JSON.
- The importing user automatically gets write access to the new book.

## Implementation

| Layer         | File                                           |
| ------------- | ---------------------------------------------- |
| Server logic  | `src/books/BookExport.ts`                      |
| Server routes | `src/books/BooksRoutes.ts`                     |
| Server compile/render | `src/books/BookManuscript.ts` (tree compile + Markdown/DOCX/EPUB renderers) |
| Web store     | `stores/books.ts` (`exportBook`, `importBook`) |
| Web UI - card | `components/BookCard.vue` (export icon)        |
| Web UI - dialog | `components/BookExportDialog.vue` (format + include choice) |
| Web UI - page | `pages/index.vue` (import button + handler)    |

## Dependencies

- `archiver` — creates tar.gz archives (TarArchive class) and the EPUB 3 zip (ZipArchive class)
- `tar` — extracts tar.gz archives on import
- `marked` — markdown → HTML for the DOCX/EPUB renderers
- `@turbodocx/html-to-docx` — HTML → DOCX Buffer for the DOCX renderer

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-17_
