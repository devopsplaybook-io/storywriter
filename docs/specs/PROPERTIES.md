# Properties

Properties are book-level metadata definitions. The shipped feature is a
**section-type label set**: a book defines a list of labels (for example
"Chapter", "Scene", "Prologue") and every section can be tagged with zero or
more of them.

## Property Definitions

| Attribute | Description                                                    |
| --------- | -------------------------------------------------------------- |
| [x] Name  | The property name (new books get the default "Section Types")   |
| [x] Type  | Always `section-type` — the only property type the server stores |
| [x] Options | Ordered list of label names usable on sections                |

- [x] Properties are defined at the **book level** and listed in the
  **Properties** panel of the book page.
- [x] Every new book is created with a single `section-type` property named
  **"Section Types"** whose options start as `["Chapter"]`; the property,
  the book and its root section are created in one transaction.
- [x] The user can rename the property, add option names and remove option
  names; the server stores the options as a JSON array.
- [x] Removing an option also removes it from every section that carried it:
  assignments are cleaned up on update, and a row whose value becomes empty is
  deleted.
- [x] Deleting the property deletes its section assignments (cascade).

## Section Values

- [x] A section can be assigned **0 or multiple** labels of a section-type
  property. Assignments are toggled as inline badges below the section title in
  the editor; the first assigned label is shown next to the section in the tree.
- [x] The labels of one section are stored as **one comma-separated value** in
  `section_properties.value` (one row per section and property).
- [x] A value can only bind a property and a section of the **same book**;
  cross-book assignments are rejected with `400` on write and delete.
- [x] Reading values needs book read access; setting and removing them needs
  write access (admins and owners always pass).
- [x] Duplicating a section copies the labels of the whole copied subtree in
  the same transaction as the sections themselves (see SECTIONS.md).
- [x] Deleting a section deletes its assignments.

_API: `GET /api/properties?bookId=…`, `POST /api/properties`,
`PUT /api/properties/:id`, `DELETE /api/properties/:id`,
`GET /api/properties/sections?bookId=…`, `GET /api/properties/section/:sectionId`,
`PUT /api/properties/section/:sectionId` (`{ propertyId, value }`) and
`DELETE /api/properties/section/:sectionId/:propertyId`._

## Typed Properties (not implemented)

The following design is **not implemented**. Only `section-type` exists in the
data model and API; the panel offers no controls for other kinds.

- [ ] Property types **text**, **number**, **boolean** and **select**.
- [ ] Per-type value inputs (text/number fields, checkbox, option dropdown).
- [ ] Typed metadata in exports.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-11-03_
