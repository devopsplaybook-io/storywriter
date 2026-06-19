# Sections

Sections are the structural building blocks of a book. They form a hierarchical tree with a single root section per book.

## Attributes

| Attribute    | Description                                   |
| ------------ | --------------------------------------------- |
| [x] Title    | The section title                             |
| [x] Content  | The main writing content (markdown supported) |
| [x] Analysis | AI analysis notes (hidden by default)         |
| [x] Version  | Integer version counter, incremented on save  |
| [x] Parent   | The parent section (null for root)            |
| [x] Order    | Sort order among siblings                     |
| [x] Type     | Section type: `text`, `container`, or `media` |
| [x] MediaId  | Reference to attached media (for media type)  |
| [x] Caption  | Optional caption for media (markdown)         |

## Section Content Types

### Text (default)

- [x] Contains markdown content edited in a textarea.
- [x] Supports Edit/Preview tabs.
- [x] Has optional AI analysis textarea.
- [x] Title is editable.

### Container

- [x] Contains only child sections (no content editor).
- [x] Used for organizing sections hierarchically.
- [x] Displayed with a folder icon in the tree.
- [x] Title is editable.

### Media

- [x] References a media item from the book's media library.
- [x] Media selector dropdown to choose from available media.
- [x] Displays preview of selected media (image).
- [x] Optional caption with markdown support.
- [x] Caption has Edit/Preview tabs.
- [x] Displayed with an image icon in the tree.

## Section Type Labels

- [x] Books can define **Section Type Labels** (e.g., "Chapter", "Scene", "Prologue").
- [x] New books start with one default label: "Chapter".
- [x] Labels are managed in the **Properties** panel (add/remove type names).
- [x] A section can be assigned **0 or multiple** type labels.
- [x] Assigned labels appear as toggle badges in the Section Editor.
- [x] The first assigned label appears as a badge in the section tree.
- [x] Labels are stored as comma-separated values in `section_properties.value`.

## Hierarchy

- [x] Each book has exactly one **root section** created automatically when the book is created.
- [x] Sections can have child sections nested to any depth.
- [x] Sections are displayed as a navigable **tree** in the sidebar.
- [x] The root section cannot be deleted.
- [x] Deleting a section also deletes all its children (cascade).
- [x] Section type icons shown in tree: `bi-file-text` (text), `bi-folder` (container), `bi-image` (media).

## Versioning

- [x] Each section maintains a version history.
- [x] A **version snapshot** captures the title, content, type, mediaId, and caption at a point in time.
- [x] Users can **save a version** manually (bookmark-style).
- [x] Users can **browse version history** via a dialog showing a table of all saved versions.
- [x] Each version can be viewed to see the content as it was at that point.
- [x] Versions are stored in the `section_versions` table.

## Editing

- [x] Sections are edited in a split-pane layout: tree on the left, editor on the right.
- [x] The editor supports **Edit** and **Preview** tabs for markdown content.
- [x] The title is edited inline with auto-save on blur.
- [x] Content is edited in a textarea with monospace font, saved on blur.
- [x] An optional **analysis** textarea is available for AI notes (hidden by default, toggled via button).
- [x] Section type can be changed via a dropdown in the header.
- [x] Media sections have a media selector and caption textarea.
- [x] Section type labels can be toggled on/off via badges below the title.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_

# Sections

Sections are the structural building blocks of a book. They form a hierarchical tree with a single root section per book.

## Attributes

| Attribute    | Description                                   |
| ------------ | --------------------------------------------- |
| [x] Title    | The section title                             |
| [x] Content  | The main writing content (markdown supported) |
| [x] Analysis | AI analysis notes (hidden by default)         |
| [x] Version  | Integer version counter, incremented on save  |
| [x] Parent   | The parent section (null for root)            |
| [x] Order    | Sort order among siblings                     |
| [x] Type     | Section type: `text`, `container`, or `media` |
| [x] MediaId  | Reference to attached media (for media type)  |
| [x] Caption  | Optional caption for media (markdown)         |

## Section Types

### Text (default)

- [x] Contains markdown content edited in a textarea.
- [x] Supports Edit/Preview tabs.
- [x] Has optional AI analysis textarea.
- [x] Title is editable.

### Container

- [x] Contains only child sections (no content editor).
- [x] Used for organizing sections hierarchically.
- [x] Displayed with a folder icon in the tree.
- [x] Title is editable.

### Media

- [x] References a media item from the book's media library.
- [x] Media selector dropdown to choose from available media.
- [x] Displays preview of selected media (image).
- [x] Optional caption with markdown support.
- [x] Caption has Edit/Preview tabs.
- [x] Displayed with an image icon in the tree.

## Hierarchy

- [x] Each book has exactly one **root section** created automatically when the book is created.
- [x] Sections can have child sections nested to any depth.
- [x] Sections are displayed as a navigable **tree** in the sidebar.
- [x] The root section cannot be deleted.
- [x] Deleting a section also deletes all its children (cascade).
- [x] Section type icons shown in tree: `bi-file-text` (text), `bi-folder` (container), `bi-image` (media).

## Versioning

- [x] Each section maintains a version history.
- [x] A **version snapshot** captures the title, content, type, mediaId, and caption at a point in time.
- [x] Users can **save a version** manually (bookmark-style).
- [x] Users can **browse version history** via a dialog showing a table of all saved versions.
- [x] Each version can be viewed to see the content as it was at that point.
- [x] Versions are stored in the `section_versions` table.

## Editing

- [x] Sections are edited in a split-pane layout: tree on the left, editor on the right.
- [x] The editor supports **Edit** and **Preview** tabs for markdown content.
- [x] The title is edited inline with auto-save on blur.
- [x] Content is edited in a textarea with monospace font, saved on blur.
- [x] An optional **analysis** textarea is available for AI notes (hidden by default, toggled via button).
- [x] Section type can be changed via a dropdown in the header.
- [x] Media sections have a media selector and caption textarea.

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_

# Sections

Sections are the structural building blocks of a book. They form a hierarchical tree with a single root section per book.

## Attributes

| Attribute    | Description                                   |
| ------------ | --------------------------------------------- |
| [x] Title    | The section title                             |
| [x] Content  | The main writing content (markdown supported) |
| [x] Analysis | AI analysis notes (hidden by default)         |
| [x] Version  | Integer version counter, incremented on save  |
| [x] Parent   | The parent section (null for root)            |
| [x] Order    | Sort order among siblings                     |

## Hierarchy

- [x] Each book has exactly one **root section** created automatically when the book is created.
- [x] Sections can have child sections nested to any depth.
- [x] Sections are displayed as a navigable **tree** in the sidebar.
- [x] The root section cannot be deleted.
- [x] Deleting a section also deletes all its children (cascade).

## Versioning

- [x] Each section maintains a version history.
- [x] A **version snapshot** captures the title and content at a point in time.
- [x] Users can **save a version** manually (bookmark-style).
- [x] Users can **browse version history** via a dialog showing a table of all saved versions.
- [x] Each version can be viewed to see the content as it was at that point.
- [x] Versions are stored in the `section_versions` table.

## Editing

- [x] Sections are edited in a split-pane layout: tree on the left, editor on the right.
- [x] The editor supports **Edit** and **Preview** tabs for markdown content.
- [x] The title is edited inline with auto-save on blur.
- [x] Content is edited in a textarea with monospace font, saved on blur.
- [x] An optional **analysis** textarea is available for AI notes (hidden by default, toggled via button).

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
