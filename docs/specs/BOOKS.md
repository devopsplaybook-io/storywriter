# Books

Books are the top-level organizational unit in Storywriter. Each book represents a writing project.

## Attributes

| Attribute       | Description                        |
| --------------- | ---------------------------------- |
| [x] Name        | The title of the book              |
| [x] Description | A short summary of the book        |
| [x] Owner       | The user who created the book      |
| [x] Access      | Users granted read or write access |

## Management

- [x] Create: any authenticated user can create a book.
- [x] Edit: the book name and description can be updated.
- [x] Delete: deleting a book also deletes all its sections, attributes, properties, and version history (cascade).
- [x] List: the books page shows all books the user owns or has access to, as a responsive card grid.

## Access Control

- [x] The book owner has full access.
- [x] The owner can grant **read** or **write** access to specific users.
- [x] Users with **read** access can view the book but not edit sections or content.
- [x] Users with **write** access can edit sections, attributes, and properties.
- [x] Access is managed via a dialog accessible from the books list.

## Data Model

- [x] Books are stored in the `books` table.
- [x] Access grants are stored in the `book_access` table (composite key: bookId + userId).
- [x] SQLite UPSERT correctly uses 4 `?` parameters; PostgreSQL reuses `$N` numbered parameters.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
