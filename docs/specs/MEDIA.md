# Media

Media items (pictures) can be attached to books and referenced by sections. Media files are stored on disk while metadata is stored in the database.

## Media Model

| Field           | Description                             |
| --------------- | --------------------------------------- |
| [x] ID          | Immutable UUID, auto-generated          |
| [x] BookId      | The book this media belongs to          |
| [x] Slug        | User-editable text, unique per book     |
| [x] Filename    | Original filename (sanitized)           |
| [x] MimeType    | MIME type (image/jpeg, image/png, etc.) |
| [x] Size        | File size in bytes                      |
| [x] DateCreated | Creation timestamp                      |

## Storage

- [x] Media files stored on disk at `DATA_DIR/media/<bookId>/<mediaId>/<filename>`
- [x] Only metadata stored in database (in `media` table)
- [x] Files deleted from disk when media is deleted

## Slug

- [x] Auto-generated from filename (lowercase, spaces to hyphens, remove extension)
- [x] Can be updated by user
- [x] Must be unique within a book (enforced by database constraint)
- [x] Slugs are sanitized: lowercase, alphanumeric + hyphens only
- [x] Automatic suffix `-1`, `-2`, etc. for duplicate slugs on upload

## Upload

- [x] Drag-and-drop upload in Media Gallery panel
- [x] Click-to-upload alternative
- [x] Multiple file upload support
- [x] Image types only: JPEG, PNG, GIF, WebP, SVG
- [x] Max file size: 10 MB (configured via fastify/multipart)
- [x] Filename sanitized on upload
- [x] Upload progress indicator

## API Endpoints

| Endpoint                                    | Method | Description                    |
| ------------------------------------------- | ------ | ------------------------------ |
| [x] `GET /api/books/:bookId/media`          | GET    | List all media for a book      |
| [x] `POST /api/books/:bookId/media`         | POST   | Upload media (multipart)       |
| [x] `GET /api/books/:bookId/media/:id`      | GET    | Get single media metadata      |
| [x] `PUT /api/books/:bookId/media/:id`      | PUT    | Update media slug              |
| [x] `DELETE /api/books/:bookId/media/:id`   | DELETE | Delete media (file + metadata) |
| [x] `GET /api/books/:bookId/media/:id/file` | GET    | Serve the actual image file    |

## Media Gallery

- [x] Displays all media for a book in a grid (sorted by slug)
- [x] Each item shows thumbnail, slug, and file size
- [x] Drag-and-drop zone at top for upload
- [x] Click item to select
- [x] Right-click context menu: edit slug, delete
- [x] Empty state: "Drag and drop images here or click to upload"
- [x] Accessible as sidebar tab (bi-image icon)

## Serving Policy

- [x] The file route (`GET /api/books/:bookId/media/:id/file`) authenticates with the `Authorization` header only; tokens passed as a query parameter are never accepted
- [x] Media displayed in the UI via in-memory object URLs: the web app fetches the file as a blob (Authorization header) and renders it through a `blob:` URL, so no token ever appears in a URL
- [x] `X-Content-Type-Options: nosniff` on every media file response
- [x] `Content-Disposition: inline` only for safe bitmap types (JPEG, PNG, GIF, WebP); SVG and any other type are served as `attachment`
- [x] `Cache-Control: private, no-store` on media file responses (private content is never cached by browsers, proxies or the service worker)
- [x] Upload MIME allow-list with magic-bytes check and server-generated filenames

## Section Integration

- [x] Sections can reference a media item via `mediaId` field
- [x] A section's `mediaId` must belong to the same book as the section; cross-book references are rejected (`400`) on create and update
- [x] Media routes validate `media.bookId === :bookId`, so another book's media is never listed, served or mutated
- [x] Media sections display image preview in editor
- [x] Optional caption with markdown support
- [x] Media selector dropdown in section editor

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-24_
