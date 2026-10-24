import { AsyncLocalStorage } from "async_hooks";
import {
  DbUtilsGetDatabase,
  DbUtilsGetType,
  convertToPostgresPlaceholders,
} from "@devopsplaybook.io/common-utils";

/**
 * Cross-dialect DB transaction helper.
 *
 * - SQLite: `BEGIN IMMEDIATE` on the single shared connection. A module-level
 *   gate makes every out-of-transaction DB call (and any other transaction)
 *   wait until the open transaction commits or rolls back, so another request
 *   can never join or observe uncommitted state.
 * - Postgres: a dedicated pooled client runs the transaction and is shared
 *   with the callback through AsyncLocalStorage; the DbUtils wrappers route
 *   SQL to that client while it is active.
 *
 * Transaction callbacks must contain DB work only (no filesystem or network
 * awaits): holding an open SQLite transaction across a slow external await
 * would stall every other database call in the process.
 *
 * Nested transactions throw.
 */

export interface DbUtilsTransactionStore {
  pgClient?: {
    query: (sql: string, params?: unknown[]) => Promise<any>;
    release: () => void;
  };
}

const als = new AsyncLocalStorage<DbUtilsTransactionStore>();

let activeTx: Promise<unknown> | null = null;

export function DbUtilsTransactionStoreGet(): DbUtilsTransactionStore | undefined {
  return als.getStore();
}

/** Resolve once no transaction is open. Used by the DbUtils wrappers. */
export async function DbUtilsTransactionWait(): Promise<void> {
  if (activeTx) {
    await activeTx;
  }
}

/**
 * Run `fn` inside a single database transaction. Resolves with `fn`'s result;
 * any error rolls the transaction back and rethrows.
 */
export async function DbUtilsTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) {
    throw new Error("Nested transactions are not supported");
  }
  // Serialize concurrent transactions: each waits for the previous one.
  const previous = activeTx;
  const promise: Promise<T> = previous
    ? previous.then(
        () => run(fn),
        () => run(fn),
      )
    : run(fn);
  activeTx = promise.then(
    () => undefined,
    () => undefined,
  );
  return promise;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  if (DbUtilsGetType() === "postgres") {
    const pool = DbUtilsGetDatabase();
    const client = await pool.connect();
    const store: DbUtilsTransactionStore = { pgClient: client };
    try {
      await client.query("BEGIN");
      const result = await als.run(store, fn);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Connection already broken; release below.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const db = DbUtilsGetDatabase();
  db.exec("BEGIN IMMEDIATE");
  const store: DbUtilsTransactionStore = {};
  try {
    const result = await als.run(store, fn);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // No transaction open; nothing to undo.
    }
    throw err;
  }
}

/** Execute SQL on the active Postgres transaction client. */
export async function DbUtilsTransactionExecSQL(
  sql: string,
  params: unknown[],
): Promise<number> {
  const store = als.getStore();
  const result = await store.pgClient.query(
    convertToPostgresPlaceholders(sql),
    params,
  );
  return result.rowCount ?? 0;
}

/** Query SQL on the active Postgres transaction client. */
export async function DbUtilsTransactionQuerySQL(
  sql: string,
  params: unknown[],
): Promise<any[]> {
  const store = als.getStore();
  const result = await store.pgClient.query(
    convertToPostgresPlaceholders(sql),
    params,
  );
  return result.rows || [];
}
