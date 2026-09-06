-- Add scopes column and remove dateCreated from users table
-- to match common-utils UsersData schema
-- Idempotent: safe to re-run if a previous attempt partially applied.

ALTER TABLE users ADD COLUMN IF NOT EXISTS scopes TEXT NOT NULL DEFAULT '[]';

ALTER TABLE users DROP COLUMN IF EXISTS "dateCreated";
