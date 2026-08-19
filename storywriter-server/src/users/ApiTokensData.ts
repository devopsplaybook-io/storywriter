import { v4 as uuidv4 } from "uuid";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  token: string;
  dateCreated: string;
}

// ==================== CRUD ====================

export async function ApiTokensDataListByUser(
  userId: string,
): Promise<ApiToken[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_BY_USER[DbUtilsGetType()],
    [userId],
  );
  return rows.map((raw: Record<string, unknown>) => ({
    id: raw.id as string,
    userId: raw.userId as string,
    name: raw.name as string,
    token: raw.token as string,
    dateCreated: raw.dateCreated as string,
  }));
}

export async function ApiTokensDataAdd(
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
  await DbUtilsExecSQL(SQL_QUERIES.INSERT[DbUtilsGetType()], [
    record.id,
    record.userId,
    record.name,
    record.token,
    record.dateCreated,
  ]);
  return record;
}

export async function ApiTokensDataDelete(id: string): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.DELETE[DbUtilsGetType()], [id]);
}

export async function ApiTokensDataGetByToken(
  tokenValue: string,
): Promise<ApiToken | null> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_BY_TOKEN[DbUtilsGetType()],
    [tokenValue],
  );
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

const SQL_QUERIES = {
  LIST_BY_USER: {
    postgres:
      'SELECT * FROM api_tokens WHERE "userId" = $1 ORDER BY "dateCreated" DESC',
    sqlite:
      "SELECT * FROM api_tokens WHERE userId = ? ORDER BY dateCreated DESC",
  },
  INSERT: {
    postgres:
      'INSERT INTO api_tokens ("id", "userId", "name", "token", "dateCreated") VALUES ($1, $2, $3, $4, $5)',
    sqlite:
      "INSERT INTO api_tokens (id, userId, name, token, dateCreated) VALUES (?, ?, ?, ?, ?)",
  },
  DELETE: {
    postgres: 'DELETE FROM api_tokens WHERE "id" = $1',
    sqlite: "DELETE FROM api_tokens WHERE id = ?",
  },
  GET_BY_TOKEN: {
    postgres: 'SELECT * FROM api_tokens WHERE "token" = $1',
    sqlite: "SELECT * FROM api_tokens WHERE token = ?",
  },
};
