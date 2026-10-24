# Attributes

Attributes are book-level metadata used to drive the consistency of the book. They define characters, settings, lore, or any reference information the author needs while writing.

## Attributes

| Attribute   | Description                        |
| ----------- | ---------------------------------- |
| [x] Title   | A short name for the attribute     |
| [x] Content | Detailed text (markdown supported) |

## Management

- [x] The user can add as many attributes as they want to a book.
- [x] Each attribute has a title and a text content (markdown supported).
- [x] Attributes are edited inline with collapsible cards:
  - [x] Collapsed view shows title and action icons.
  - [x] Clicking expands to edit mode with title input and content editor.
- [x] The content editor supports **Edit** and **Preview** tabs for markdown.
- [x] Attribute title and content are **auto-saved** ~2s after the last edit (debounced on idle); the explicit **Save** button remains as the immediate flush.
- [x] A local draft buffer (localStorage) keeps in-flight attribute text so it survives a crash, tab close or network loss, and is restored when the attribute is edited again.
- [x] Save and management failures surface as toast notifications instead of failing silently.
- [x] Attributes can be deleted individually.

## Versioning

- [x] Attribute version history is **removed**: migration `init-0002` dropped the `book_attribute_versions` table and the attribute `version` counter, and the UI no longer offers attribute snapshots.
- [x] Point-in-time snapshots are taken at the **book level** instead (see BOOKS.md).

## Cascade

- [x] When a book is deleted, all its attributes are also deleted.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-24_
