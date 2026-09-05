import { Span } from "@opentelemetry/sdk-trace-base";
import { v4 as uuidv4 } from "uuid";
import { DbUtilsExecSQL, DbUtilsQuerySQL } from "../utils/DbUtils";

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  token: string;
  dateCreated: string;
}

// ==================== CRUD ====================

export async function ApiTokensDataListByUser(
  context: Span | undefined,
  userId: string,
): Promise<ApiToken[]> {
  const rows = await DbUtilsQuerySQL(context, SQL_QUERIES.LIST_BY_USER, [
    userId,
  ]);
  return rows.map((raw: Record<string, unknown>) => ({
    id: raw.id as string,
    userId: raw.userId as string,
    name: raw.name as string,
    token: raw.token as string,
    dateCreated: raw.dateCreated as string,
  }));
}

export async function ApiTokensDataAdd(
  context: Span | undefined,
  userId: string,
  name: string,
  token: string,
): Promise<ApiToken> {
  const record: ApiToken = {
    id: uuidv4(),
    userId,
    name,
    token,
    dateCreated: new Date().toISOString(),
  };
  await DbUtilsExecSQL(context, SQL_QUERIES.INSERT, [
    record.id,
    record.userId,
    record.name,
    record.token,
    record.dateCreated,
  ]);
  return record;
}

export async function ApiTokensDataDelete(
  context: Span | undefined,
  id: string,
): Promise<void> {
  await DbUtilsExecSQL(context, SQL_QUERIES.DELETE, [id]);
}

export async function ApiTokensDataGetByToken(
  context: Span | undefined,
  tokenValue: string,
): Promise<ApiToken | null> {
  const rows = await DbUtilsQuerySQL(context, SQL_QUERIES.GET_BY_TOKEN, [
    tokenValue,
  ]);
  if (rows.length === 0) return null;
  const raw = rows[0];
  return {
    id: raw.id as string,
    userId: raw.userId as string,
    name: raw.name as string,
    token: raw.token as string,
    dateCreated: raw.dateCreated as string,
  };
}

// SQL
// Written SQLite-first with quoted identifiers (valid for both backends);
// the DbUtils facade converts `?` placeholders for Postgres.

const SQL_QUERIES = {
  LIST_BY_USER: 'SELECT * FROM api_tokens WHERE "userId" = ? ORDER BY "dateCreated" DESC',
  INSERT:
    'INSERT INTO api_tokens ("id", "userId", "name", "token", "dateCreated") VALUES (?, ?, ?, ?, ?)',
  DELETE: 'DELETE FROM api_tokens WHERE "id" = ?',
  GET_BY_TOKEN: 'SELECT * FROM api_tokens WHERE "token" = ?',
};
