import { DbUtilsExecSQL, DbUtilsGetType } from "../utils/DbUtils";

const SQL = {
  postgres:
    'UPDATE books SET "contentVersion" = "contentVersion" + 1 WHERE "id" = $1',
  sqlite: "UPDATE books SET contentVersion = contentVersion + 1 WHERE id = ?",
};

/**
 * Bump a book's internal content version. Called by every content-bearing
 * write so the analysis cache can detect staleness without re-reading the
 * whole book. Joins the caller's transaction when one is open.
 */
export async function BookContentVersionBump(bookId: string): Promise<void> {
  await DbUtilsExecSQL(SQL[DbUtilsGetType()], [bookId]);
}
