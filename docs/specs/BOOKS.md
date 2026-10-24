# Books

Books are the top-level organizational unit in Storywriter. Each book represents a writing project.

## Attributes

| Attribute       | Description                        |
| --------------- | ---------------------------------- |
| [x] Name        | The title of the book              |
| [x] Description | A short summary of the book        |
| [x] Writing Goal | Word-count target for the book (0 = no goal) |
| [x] Owner       | The user who created the book (`books.ownerId`) |
| [x] Access      | Users granted read or write access |

## Management

- [x] Create: any authenticated user can create a book; the creator becomes its explicit **owner**.
- [x] Edit: the book name and description can be updated (write access).
- [x] Edit: a per-book **writing goal** (words) can be set via the Edit Book dialog; 0 means no goal.
- [x] Delete: owner or admin only. Deleting a book also deletes all its sections, attributes, properties, and version history (cascade).
- [x] List: the books page shows all books the user owns or has access to, as a responsive card grid. Books with no owner and no access grant are no longer visible to non-admins.

## Access Control

- [x] The book owner has full access (read, write, access management, delete).
- [x] Admins keep a global bypass; every other user resolves to `owner`, `write`, `read` or no access.
- [x] The owner (or an admin) can grant **read** or **write** access to specific users.
- [x] The owner row cannot be changed or removed through the access endpoints.
- [x] Users with **read** access can view the book but not edit sections or content.
- [x] Users with **write** access can edit sections, attributes, and properties.
- [x] Access is managed via a dialog accessible from the books list.
- [x] Every book-scoped GET requires at least read access; a missing or unauthorized book returns `403`/`404` consistently.

## Data Model

- [x] Books are stored in the `books` table.
- [x] The writing goal is stored in the `books.writingGoal` column (integer, default 0; migration `init-0005`).
- [x] Ownership is stored in `books.ownerId` (nullable for migration safety; migration `init-0006` backfills it from the first `write` grantee, else the first admin, and ensures an owner `write` access row).
- [x] Access grants are stored in the `book_access` table (composite key: bookId + userId).
- [x] SQLite UPSERT correctly uses 4 `?` parameters; PostgreSQL reuses `$N` numbered parameters.
- [x] Book list/detail responses include `ownerId` and the caller's `permission` (`admin`/`owner`/`write`/`read`/null).
- [x] Book version list/detail responses omit the heavy `snapshot`; clients fetch it from the read-checked `GET /api/books/:id/versions/:versionId/snapshot`.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-23_
