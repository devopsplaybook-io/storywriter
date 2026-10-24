# Sections

Sections are the structural building blocks of a book. They form a hierarchical tree with a single root section per book.

## Attributes

| Attribute    | Description                                   |
| ------------ | --------------------------------------------- |
| [x] Title    | The section title                             |
| [x] Content  | The main writing content (markdown supported) |
| [x] Analysis | AI analysis notes (editable in the AI Notes tab) |
| [x] Parent   | The parent section (null for root)            |
| [x] Order    | Sort order among siblings                     |
| [x] Type     | Section type: `text`, `container`, or `media` |
| [x] MediaId  | Reference to attached media (for media type)  |
| [x] Caption  | Optional caption for media (markdown)         |

## Section Content Types

### Text (default)

- [x] Contains markdown content edited in a textarea.
- [x] Supports Edit/Preview tabs.
- [x] Has an **AI Notes** tab holding per-section AI analysis notes (see Editing and ANALYSIS.md).
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
- [x] Creates and copies must stay inside one book: the parent/target must resolve to a section of the same `bookId` (`400` otherwise), and child lookups are filtered by `bookId`.
- [x] Deleting a section only removes sections of its own book; legacy cross-book children are re-parented under their own book's root instead of being deleted.
- [x] Section type icons shown in tree: `bi-file-text` (text), `bi-folder` (container), `bi-image` (media).

## Versioning

- [x] Per-section version history is **removed**: migration `init-0002` dropped the `section_versions` table and the section `version` counter, and the UI no longer offers per-section snapshots.
- [x] Point-in-time snapshots are taken at the **book level** instead (see BOOKS.md).

## Editing

- [x] Sections are edited in a split-pane layout: tree on the left, editor on the right.
- [x] The editor supports **Edit** and **Preview** tabs for markdown content.
- [x] The title is edited inline with auto-save on blur.
- [x] Content is edited in a textarea with monospace font, saved on blur.
- [x] An **AI Notes** tab holds the section's AI analysis notes: an editable textarea (markdown), autosaved and draft-protected like the content, with a **Generate Analysis** button that fills the notes from the section content and the book's attributes (asking for confirmation before overwriting existing notes). Only shown for text sections.
- [x] An **AI actions menu** (sparkles icon) in the editor toolbar offers **Continue**, **Summarize**, **Improve** and **Brainstorm**; each action runs on demand and shows its result in a dialog with **Insert at Cursor** (into the content), **Save to AI Notes** and **Discard** — nothing is written into the manuscript without explicit confirmation.
- [x] AI features are disabled with a clear explanation when the server has no LLM configured (see ANALYSIS.md).
- [x] Section type can be changed via a dropdown in the header.
- [x] Media sections have a media selector and caption textarea.
- [x] Section type labels can be toggled on/off via badges below the title.
- [x] Section content is **auto-saved** ~2s after the last edit (debounced on idle) for title, content, AI notes and caption; saving on blur remains as the immediate flush.
- [x] A global **save-status indicator** in the editor header shows unsaved → saving → saved → error.
- [x] The browser warns before closing or reloading the tab while there is unsaved work (`beforeunload` guard).
- [x] A local draft buffer (localStorage) keeps in-flight text so it survives a crash, tab close or network loss, and is restored on the next open.
- [x] A **live word count** for the section (markdown stripped) is shown in the editor header and updates per keystroke.
- [x] The sidebar shows the **running word total for the book**, live between autosave ticks; when a writing goal is set it shows the target, the percentage and a progress bar.
- [x] **Focus mode** collapses the sidebar, book nav and global header for distraction-free writing (centered measure); toggled via the editor button or Ctrl/Cmd+Shift+F, exits with Escape; an optional typewriter-scrolling preference persists in localStorage.
- [x] A compact **formatting toolbar** (bold, italic, heading, lists, quote, inline code, link, image) inserts markdown around the selection and keeps focus.
- [x] Keyboard shortcuts in the editor: Ctrl/Cmd+B (bold), Ctrl/Cmd+I (italic), Ctrl/Cmd+K (link), Ctrl/Cmd+F (find & replace).
- [x] **Find & replace** within the section: match counter, previous/next navigation (Enter / Shift+Enter), replace current and replace all; closes with Escape.

## Restructuring

- [x] Sections can be restructured by drag-and-drop in the tree: dropping on a container moves the section under it; dropping between siblings reorders it.
- [x] The root section cannot be moved, and a section cannot be moved into its own subtree.
- [x] A tree node context menu (also via right-click) offers rename, duplicate, move to… and delete.
- [x] Duplicating a section copies it with its whole subtree, keeping type, media and caption; the copy is inserted right after the original.
- [x] Copying into the section's own subtree, across books, or copying the root is rejected with `400`.
- [x] Copy is bounded (`MAX_COPY_NODES = 1000`, `MAX_COPY_DEPTH = 100`) and inserted as one batched multi-row INSERT, so a failed copy leaves no partial tree.
- [x] Duplicated sections start with **empty AI notes** (regenerable content is not copied).
- [x] A keyboard-accessible "Move to…" dialog moves a section to any allowed container for touch and screen-reader users.

_API: `PUT /api/sections/:id` accepts `analysis`; `POST /api/sections/:id/analysis` regenerates the AI notes; `POST /api/sections/:id/ai-action` runs an AI action (see ANALYSIS.md)._

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-10-24_
