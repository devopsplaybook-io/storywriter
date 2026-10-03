-- Create the users_api_tokens table required by the common-utils UsersRoutes
-- API token endpoints (only the SHA-256 hash of a token is persisted).

CREATE TABLE IF NOT EXISTS users_api_tokens (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    "userId" VARCHAR(50) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "dateCreated" VARCHAR(100) NOT NULL,
    "expiresAt" TEXT,
    "lastUsedAt" TEXT,
    FOREIGN KEY ("userId") REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_tokens_token_hash ON users_api_tokens ("tokenHash");
CREATE INDEX IF NOT EXISTS idx_users_api_tokens_user_id ON users_api_tokens ("userId");
