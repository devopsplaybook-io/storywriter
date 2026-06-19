# Export / Import

- [x] Export a book as a tar.gz archive
- [x] Import a book from a tar.gz archive
- [x] Versioned manifest inside the archive (currently `1.0`)
- [x] Export available from the book list (download icon on each card)
- [x] Import available from the book list header (Import button)

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

## API Endpoints

### Export

```
GET /api/books/:id/export
```

- Requires authentication and read access to the book.
- Returns a `tar.gz` file stream.
- Response headers:
  - `Content-Type: application/gzip`
  - `Content-Disposition: attachment; filename="<bookName>.tar.gz"`
  - `X-Filename: <bookName>.tar.gz`

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
| Web store     | `stores/books.ts` (`exportBook`, `importBook`) |
| Web UI - card | `components/BookCard.vue` (export icon)        |
| Web UI - page | `pages/index.vue` (import button + handler)    |

## Dependencies

- `archiver` — creates tar.gz archives (TarArchive class)
- `tar` — extracts tar.gz archives on import
