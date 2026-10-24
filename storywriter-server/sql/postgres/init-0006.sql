-- Introduce explicit book ownership and backfill it.
-- The owner is the first user holding a write grant, otherwise the first
-- admin user (legacy books without any access row). Each owner also receives
-- an explicit write grant so legacy app versions keep working.

ALTER TABLE books ADD COLUMN "ownerId" VARCHAR(50);

UPDATE books
SET "ownerId" = (
  SELECT ba."userId" FROM book_access ba
  WHERE ba."bookId" = books."id" AND ba.permission = 'write'
  ORDER BY ba."userId" ASC LIMIT 1
)
WHERE "ownerId" IS NULL;

UPDATE books
SET "ownerId" = (SELECT u.id FROM users u WHERE u.role = 'admin' ORDER BY u.id ASC LIMIT 1)
WHERE "ownerId" IS NULL;

INSERT INTO book_access ("bookId", "userId", permission)
SELECT b."id", b."ownerId", 'write'
FROM books b
WHERE b."ownerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM book_access ba
    WHERE ba."bookId" = b."id" AND ba."userId" = b."ownerId"
  );

CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books ("ownerId");
