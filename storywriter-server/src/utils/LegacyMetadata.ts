import * as fs from "fs-extra";
import * as path from "path";
import { Config } from "../Config";
import { OTelLogger } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("legacy-metadata");

/**
 * One-shot migration for databases created before v0.2.0.
 *
 * The pre-v0.2.0 local migration runner created a `metadata` table with the
 * schema `(key TEXT PRIMARY KEY, value TEXT)` and stored a single row
 * `key='migrations', value='["init-0000.sql",...]'`.
 *
 * common-utils' `SqlDbUtilsInit` expects `(type, value, dateCreated)` with one
 * row per applied version (`type='db_version', value='<N>'`). Without this
 * shim, existing deployments crash on startup with
 * `SqliteError: no such column: type`.
 *
 * This function is idempotent: it only rewrites the table when the legacy
 * `key` column is present.
 */
export async function LegacyMetadataMigrate(config: Config): Promise<void> {
  if (config.DATABASE_TYPE === "postgres") {
    await migratePostgres(config);
  } else {
    await migrateSqlite(config);
  }
}

async function migrateSqlite(config: Config): Promise<void> {
  const dbPath = path.join(config.DATA_DIR, "database.db");
  if (!(await fs.pathExists(dbPath))) {
    // Fresh install — nothing to migrate.
    return;
  }

  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath);
  try {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'",
      )
      .get();
    if (!tableExists) {
      return;
    }

    const columns = db.prepare("PRAGMA table_info(metadata)").all() as {
      name: string;
    }[];
    const hasKey = columns.some((c) => c.name === "key");
    const hasType = columns.some((c) => c.name === "type");
    if (!hasKey || hasType) {
      // Already on the new schema (or unrelated table) — nothing to do.
      return;
    }

    const appliedVersions = readLegacyVersionsSqlite(db);
    logger.info(
      `Legacy metadata table detected. Applied versions: [${appliedVersions.join(", ")}]`,
    );

    db.exec("DROP TABLE metadata");
    db.exec(`
      CREATE TABLE metadata (
        type VARCHAR(100) NOT NULL,
        value TEXT NOT NULL,
        dateCreated VARCHAR(100) NOT NULL
      )
    `);
    const insert = db.prepare(
      "INSERT INTO metadata (type, value, dateCreated) VALUES ('db_version', ?, ?)",
    );
    const now = new Date().toISOString();
    for (const version of appliedVersions) {
      insert.run(String(version), now);
    }
    logger.info("Legacy metadata table migrated to common-utils schema");
  } finally {
    db.close();
  }
}

function readLegacyVersionsSqlite(
  db: { prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] } },
): number[] {
  const rows = db
    .prepare("SELECT value FROM metadata WHERE key = 'migrations'")
    .all() as { value: string }[];
  if (rows.length === 0 || !rows[0].value) {
    return [];
  }
  return parseAppliedFilenames(rows[0].value);
}

async function migratePostgres(config: Config): Promise<void> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    host: config.DATABASE_POSTGRES_HOST,
    port: config.DATABASE_POSTGRES_PORT,
    user: config.DATABASE_POSTGRES_USER,
    password: config.DATABASE_POSTGRES_PASSWORD,
    database: config.DATABASE_POSTGRES_DATABASE,
  });
  try {
    const tableRes = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metadata') AS exists",
    );
    if (!tableRes.rows[0]?.exists) {
      return;
    }

    const colsRes = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'metadata'",
    );
    const columns = colsRes.rows.map((r: { column_name: string }) => r.column_name);
    const hasKey = columns.includes("key");
    const hasType = columns.includes("type");
    if (!hasKey || hasType) {
      return;
    }

    const rowsRes = await pool.query(
      "SELECT value FROM metadata WHERE key = 'migrations'",
    );
    const appliedVersions =
      rowsRes.rows.length > 0 && rowsRes.rows[0].value
        ? parseAppliedFilenames(rowsRes.rows[0].value)
        : [];
    logger.info(
      `Legacy metadata table detected. Applied versions: [${appliedVersions.join(", ")}]`,
    );

    await pool.query("DROP TABLE metadata");
    await pool.query(`
      CREATE TABLE metadata (
        type VARCHAR(100) NOT NULL,
        value TEXT NOT NULL,
        "dateCreated" VARCHAR(100) NOT NULL
      )
    `);
    const now = new Date().toISOString();
    for (const version of appliedVersions) {
      await pool.query(
        "INSERT INTO metadata (type, value, \"dateCreated\") VALUES ('db_version', $1, $2)",
        [String(version), now],
      );
    }
    logger.info("Legacy metadata table migrated to common-utils schema");
  } finally {
    await pool.end();
  }
}

/**
 * Parse the legacy `["init-0000.sql","init-0001.sql",...]` JSON array into
 * the list of numeric versions it represents.
 */
function parseAppliedFilenames(raw: string): number[] {
  let filenames: string[];
  try {
    filenames = JSON.parse(raw) as string[];
  } catch {
    return [];
  }
  const versions: number[] = [];
  for (const filename of filenames) {
    const match = /init-(\d+)\.sql/.exec(filename);
    if (match) {
      versions.push(Number(match[1]));
    }
  }
  return versions.sort((a, b) => a - b);
}
