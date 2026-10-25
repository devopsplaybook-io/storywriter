-- Hot-path indexes matching the frequent list/children/access queries.
-- media.bookId is intentionally not indexed: the UNIQUE("bookId", "slug")
-- constraint already provides a usable leftmost-prefix index for
-- WHERE "bookId" = ? media lookups.

CREATE INDEX IF NOT EXISTS idx_sections_book_parent_order ON sections ("bookId", "parentId", "orderIndex");

CREATE INDEX IF NOT EXISTS idx_book_access_user_book ON book_access ("userId", "bookId");

CREATE INDEX IF NOT EXISTS idx_book_attributes_book ON book_attributes ("bookId");

CREATE INDEX IF NOT EXISTS idx_book_properties_book ON book_properties ("bookId");

CREATE INDEX IF NOT EXISTS idx_section_properties_property ON section_properties ("propertyId");

CREATE INDEX IF NOT EXISTS idx_book_versions_book_number ON book_versions ("bookId", "versionNumber");

-- Optimistic concurrency for section edits: incremented on every update;
-- writers may pass the revision they read and receive 409 when it moved on.
ALTER TABLE sections ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
