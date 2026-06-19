# Attributes

Attributes are book-level metadata used to drive the consistency of the book. They define characters, settings, lore, or any reference information the author needs while writing.

## Attributes

| Attribute   | Description                        |
| ----------- | ---------------------------------- |
| [x] Title   | A short name for the attribute     |
| [x] Content | Detailed text (markdown supported) |
| [x] Version | Integer version counter            |

## Management

- [x] The user can add as many attributes as they want to a book.
- [x] Each attribute has a title and a text content (markdown supported).
- [x] Attributes are edited inline with collapsible cards:
  - [x] Collapsed view shows title, version, and action icons.
  - [x] Clicking expands to edit mode with title input and content editor.
- [x] The content editor supports **Edit** and **Preview** tabs for markdown.
- [x] Attributes can be deleted individually.

## Versioning

- [x] Each attribute supports version history, similar to sections.
- [x] Users can **save a version** of an attribute to capture its state.
- [x] Users can **browse version history** via an inline dialog with a table of versions.
- [x] Each version can be viewed to see the content as it was at that point.
- [x] Versions are stored in the `book_attribute_versions` table.

## Cascade

- [x] When a book is deleted, all its attributes and attribute versions are also deleted.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
