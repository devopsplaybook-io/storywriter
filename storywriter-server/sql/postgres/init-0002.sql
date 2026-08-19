-- Drop old versioning tables
DROP TABLE IF EXISTS section_versions;
DROP TABLE IF EXISTS book_attribute_versions;

-- Remove version column from sections
ALTER TABLE sections DROP COLUMN IF EXISTS "version";

-- Remove version column from book_attributes
ALTER TABLE book_attributes DROP COLUMN IF EXISTS version;

-- Create book-level versioning table
CREATE TABLE IF NOT EXISTS book_versions (
    id VARCHAR(50) PRIMARY KEY,
    "bookId" VARCHAR(50) NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    snapshot TEXT NOT NULL,
    "dateCreated" VARCHAR(100) NOT NULL,
    FOREIGN KEY ("bookId") REFERENCES books(id)
);
