-- Internal content-version counter used to detect stale book-analysis reports
-- without re-reading the whole book. Every content-bearing write bumps it.

ALTER TABLE books ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;
