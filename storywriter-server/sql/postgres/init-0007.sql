-- Add the user-facing display name for media files. Storage filenames are
-- server-generated (<mediaId>.<ext>); the original upload name is kept here.
-- Legacy rows keep their sanitized filename as the display name.

ALTER TABLE media ADD COLUMN "originalFilename" VARCHAR(500) NOT NULL DEFAULT '';

UPDATE media SET "originalFilename" = filename WHERE "originalFilename" = '';
