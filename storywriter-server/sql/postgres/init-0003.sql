-- Add scopes column and remove dateCreated from users table
-- to match common-utils UsersData schema

ALTER TABLE users ADD COLUMN scopes TEXT NOT NULL DEFAULT '[]';

ALTER TABLE users DROP COLUMN "dateCreated";
