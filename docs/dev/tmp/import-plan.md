# Import DevOpsPlaybook Content

## Overview

Import `devopsplaybook-content` Eleventy site into the storywriter application
as a book called "DevOpsPlaybook".

## Method

A TypeScript script (`storywriter-server/scripts/import-devopsplaybook.ts`)
generates an import archive (tar.gz) matching the app's export format (v1.0)
and uploads it via the `/api/books/import` endpoint.

## Content Structure

The content directory contains a hierarchical Eleventy site:

- `/index.md` — Home page
- `/approach.md` — Approach documentation
- `/references.md` — References list
- `definition/` — DevOps definition, principles, agility
- `practices/` — All DevOps practices (application, infrastructure, operation,
  packaging, project, quality, release, security)
- `implementation/` — Implementation guides, maturity stages, team structure
- `inventory/` — Practice and tool inventory
- `changelog/` — Changelog
- `_includes/`, `_data/` — Eleventy template files (excluded)

## Premium Content

26 markdown files contain `{% PremiumContent %}...{% endPremiumContent %}`
blocks. These are extracted into separate child sections titled
`{Page Title} (Premium)` and tagged with the "Premium Content" section type.

## Section Types

- "Chapter" (default for all new books)
- "Premium Content" (assigned to premium content sections)

## Media Files

SVG and webp files found in the content directory are uploaded as media items
in the app.

## Import Date

${new Date().toISOString()}
