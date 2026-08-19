# User Interface

The web interface is a **Progressive Web Application (PWA)**.
It is installable on mobile and desktop devices and works offline.

## Characteristics

- [x] **Responsive**: Adapts to all screen sizes from mobile to desktop.
- [x] **PWA**: Installable with offline support, configured via `@vite-pwa/nuxt`.

## Navigation

- [x] There is a **top header menu** to switch between views (Books, Admin, Settings).
- [x] On mobile, nav labels are hidden and only icons are shown.
- [x] On intermediate screens, the brand name is hidden.
- [x] Offline support (PWA configured with service worker, cache strategies).

## Book Detail Layout

The book detail page uses a **responsive split-pane layout** following the feedwatcher sources pattern:

### Desktop (> 768px)

- [x] **Left sidebar** (240-300px): contains the section tree, attributes editor, or properties editor, switchable via icon tab buttons.
- [x] **Right editor panel**: contains the section content editor, taking remaining space.
- [x] Sidebar has a back link to the books list, book title, and panel tab buttons (Sections, Attributes, Properties).

### Mobile (≤ 768px)

- [x] **Collapsible top panel**: the sidebar collapses to save screen space.
- [x] A **toggle button** shows/hides the sidebar with a smooth transition.
- [x] The toggle displays the active panel label (Sections, Attributes, or Properties).
- [x] Selecting a section on mobile **auto-closes** the sidebar to show the editor.
- [x] The editor panel takes the full width below the sidebar.

### Touch Device Adaptations

- [x] Action icons (add, delete, edit, etc.) that are hover-revealed on desktop are **always visible** on touch/mobile devices.
- [x] Form edit rows stack vertically on narrow screens.
- [x] Attribute meta info (version badge) is hidden on mobile to save space.

## Pages

### Books List (`/`)

- [x] Responsive grid of book cards.
- [x] On mobile: single column layout, full-width "New Book" button.
- [x] Each card shows book name, description, date, and action icons (access, edit, delete).

### Book Detail (`/books/:id`)

- [x] Split-pane layout as described above.
- [x] Three sidebar panels switchable via icon buttons: **Sections**, **Attributes**, **Properties**.
- [x] Section editor with markdown edit/preview tabs.

### Admin (`/admin`)

- [x] User management table.
- [x] On mobile: horizontally scrollable table, stacked section header.

### Settings (`/settings`)

- [x] Theme toggle (light/dark/system).
- [x] Account info and password change form.
- [x] On mobile: stacked setting rows, wrapping theme controls.

### Login (`/login`)

- [x] Centered login card (max-width 400px).
- [x] Detects uninitialized server and offers admin account creation flow.

## Components

### Shared Patterns

- [x] **Card**: `.card` class with border, padding, and header.
- [x] **Section header**: `.section-header` flex row with space-between alignment.
- [x] **Actions**: `.actions` flex row for icon buttons.
- [x] **Dialogs**: `<dialog>` elements with `<article>` inside, following PicoCSS patterns.
- [x] **Loading indicator**: animated CSS bars pattern.
- [x] **Markdown body**: `.markdown-body` class for rendered markdown content.
- [x] **Design tokens**: CSS custom properties for spacing (`--space-*`), radius (`--radius-*`), typography (`--text-*`), transitions (`--transition-*`), and shadows (`--shadow-*`).

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
