-- Version numbers are unique per book. Before adding the constraint, books
-- that already contain duplicated (bookId, versionNumber) pairs are
-- renumbered deterministically: every version of such a book becomes
-- contiguous starting at 1 in (versionNumber, dateCreated, id) order. Ids and
-- snapshots are untouched and no history is deleted.
--
-- init-0008 created this index as non-unique; it is re-created as UNIQUE.

CREATE TEMP TABLE _book_versions_renumber AS
SELECT "id" AS id, ROW_NUMBER() OVER (
    PARTITION BY "bookId" ORDER BY "versionNumber", "dateCreated", "id"
) AS new_number
FROM book_versions
WHERE "bookId" IN (
    SELECT "bookId" FROM book_versions
    GROUP BY "bookId", "versionNumber" HAVING COUNT(*) > 1
);

UPDATE book_versions
SET "versionNumber" = (
    SELECT new_number FROM _book_versions_renumber r WHERE r.id = book_versions.id
)
WHERE id IN (SELECT id FROM _book_versions_renumber);

DROP TABLE _book_versions_renumber;

DROP INDEX IF EXISTS idx_book_versions_book_number;

CREATE UNIQUE INDEX idx_book_versions_book_number
    ON book_versions ("bookId", "versionNumber");
