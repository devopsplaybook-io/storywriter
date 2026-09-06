-- Add scopes column and remove dateCreated from users table
-- to match common-utils UsersData schema
-- Idempotent: handles partial runs where users_new was left behind.

DROP TABLE IF EXISTS users_new;

CREATE TABLE users_new (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    passwordEncrypted VARCHAR(500) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    scopes TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO users_new (id, name, passwordEncrypted, role, scopes)
SELECT id, name, passwordEncrypted, role, '[]' FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
