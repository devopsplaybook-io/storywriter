import { Span } from "@opentelemetry/sdk-trace-base";
import {
  DbUtilsSetOTel as _DbUtilsSetOTel,
  DbUtilsInit as _DbUtilsInit,
  DbUtilsGetDatabase as _DbUtilsGetDatabase,
  convertToPostgresPlaceholders as _convertToPostgresPlaceholders,
  DbUtilsExecSQL as _DbUtilsExecSQL,
  DbUtilsQuerySQL as _DbUtilsQuerySQL,
  DbUtilsGetType as _DbUtilsGetType,
} from "@devopsplaybook.io/common-utils";
import {
  DbUtilsTransactionStoreGet,
  DbUtilsTransactionWait,
} from "./DbTransaction";

// Re-export functions that don't need wrapping
export const DbUtilsSetOTel = _DbUtilsSetOTel;
export const DbUtilsInit = _DbUtilsInit;
export const DbUtilsGetDatabase = _DbUtilsGetDatabase;
export const convertToPostgresPlaceholders = _convertToPostgresPlaceholders;
export const DbUtilsGetType = _DbUtilsGetType;

async function RunExecSQL(
  context: Span | undefined,
  sql: string,
  params: unknown[],
): Promise<number> {
  const store = DbUtilsTransactionStoreGet();
  if (store && store.pgClient) {
    const result = await store.pgClient.query(
      _convertToPostgresPlaceholders(sql),
      params,
    );
    return result.rowCount ?? 0;
  }
  if (!store) {
    // Outside any transaction: wait for an open SQLite transaction to finish.
    await DbUtilsTransactionWait();
  }
  return Promise.resolve(_DbUtilsExecSQL(context, sql, params));
}

async function RunQuerySQL(
  context: Span | undefined,
  sql: string,
  params: unknown[],
  debug?: boolean,
): Promise<any[]> {
  const store = DbUtilsTransactionStoreGet();
  if (store && store.pgClient) {
    const result = await store.pgClient.query(
      _convertToPostgresPlaceholders(sql),
      params,
    );
    return result.rows || [];
  }
  if (!store) {
    // Outside any transaction: wait for an open SQLite transaction to finish.
    await DbUtilsTransactionWait();
  }
  return Promise.resolve(_DbUtilsQuerySQL(context, sql, params, debug));
}

/**
 * Backward-compatible wrapper for DbUtilsExecSQL.
 * Accepts optional context parameter for OTel tracing.
 */
export function DbUtilsExecSQL(
  sql: string,
  params?: unknown[],
): Promise<number>;
export function DbUtilsExecSQL(
  context: Span | undefined,
  sql: string,
  params?: unknown[],
): Promise<number>;
export function DbUtilsExecSQL(
  contextOrSql: Span | undefined | string,
  sqlOrParams?: string | unknown[],
  params?: unknown[],
): Promise<number> {
  // Detect if first argument is a string (old signature) or Span/undefined (new signature)
  if (typeof contextOrSql === "string") {
    // Old signature: DbUtilsExecSQL(sql, params)
    return RunExecSQL(undefined, contextOrSql, (sqlOrParams as unknown[]) || []);
  }
  // New signature: DbUtilsExecSQL(context, sql, params)
  return RunExecSQL(
    contextOrSql,
    sqlOrParams as string,
    (params as unknown[]) || [],
  );
}

/**
 * Backward-compatible wrapper for DbUtilsQuerySQL.
 * Accepts optional context parameter for OTel tracing.
 */
export function DbUtilsQuerySQL(
  sql: string,
  params?: unknown[],
  debug?: boolean,
): Promise<any[]>;
export function DbUtilsQuerySQL(
  context: Span | undefined,
  sql: string,
  params?: unknown[],
  debug?: boolean,
): Promise<any[]>;
export function DbUtilsQuerySQL(
  contextOrSql: Span | undefined | string,
  sqlOrParams?: string | unknown[],
  paramsOrDebug?: unknown[] | boolean,
  debug?: boolean,
): Promise<any[]> {
  // Detect if first argument is a string (old signature) or Span/undefined (new signature)
  if (typeof contextOrSql === "string") {
    // Old signature: DbUtilsQuerySQL(sql, params, debug)
    return RunQuerySQL(
      undefined,
      contextOrSql,
      (sqlOrParams as unknown[]) || [],
      paramsOrDebug as boolean,
    );
  }
  // New signature: DbUtilsQuerySQL(context, sql, params, debug)
  return RunQuerySQL(
    contextOrSql,
    sqlOrParams as string,
    (paramsOrDebug as unknown[]) || [],
    debug,
  );
}
