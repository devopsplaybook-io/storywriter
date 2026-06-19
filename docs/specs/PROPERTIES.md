# Properties

Properties are custom key-value metadata that can be defined at the book level and assigned values per section. They allow authors to track custom data across sections.

## Property Definitions

| Attribute   | Description                                      |
| ----------- | ------------------------------------------------ |
| [x] Name    | The property name                                |
| [x] Type    | One of: text, number, boolean, select            |
| [x] Options | For select type: comma-separated list of choices |

## Management

- [x] Properties are defined at the **book level**.
- [x] The user can create, edit, and delete property definitions.
- [x] Supported types: **text**, **number**, **boolean**, **select**.
- [x] Select properties have a list of predefined options.

## Section Values

- [x] Each property can have a value assigned to a specific **section**.
- [x] Values are edited inline in the properties sidebar panel.
- [x] Input controls adapt to the property type:
  - [x] **text** — text input
  - [x] **number** — number input
  - [x] **boolean** — checkbox
  - [x] **select** — dropdown with predefined options

## Cascade

- [x] When a book is deleted, all its property definitions and section values are also deleted.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
