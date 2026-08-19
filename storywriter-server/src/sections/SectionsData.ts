import { Section } from "../model/Section";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";

// ==================== Section CRUD ====================

export async function SectionsDataGet(id: string): Promise<Section> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_SECTION_BY_ID[DbUtilsGetType()],
    [id],
  );
  if (rows.length === 0) {
    return null;
  }
  return Section.fromJson(rows[0]);
}

export async function SectionsDataListByBook(
  bookId: string,
): Promise<Section[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_SECTIONS_BY_BOOK[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((raw) => Section.fromJson(raw));
}

export async function SectionsDataListChildren(
  parentId: string,
): Promise<Section[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_CHILDREN[DbUtilsGetType()],
    [parentId],
  );
  return rows.map((raw) => Section.fromJson(raw));
}

export async function SectionsDataGetRootSection(
  bookId: string,
): Promise<Section> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_ROOT_SECTION[DbUtilsGetType()],
    [bookId],
  );
  if (rows.length === 0) {
    return null;
  }
  return Section.fromJson(rows[0]);
}

export async function SectionsDataAddRootSection(
  bookId: string,
): Promise<Section> {
  const section = new Section();
  section.bookId = bookId;
  section.parentId = null;
  section.type = "container";
  section.title = "Root";
  section.orderIndex = 0;
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_SECTION[DbUtilsGetType()], [
    section.id,
    section.bookId,
    section.parentId,
    section.type,
    section.title,
    section.content,
    section.mediaId,
    section.caption,
    section.orderIndex,
    section.dateCreated,
    section.dateUpdated,
  ]);
  return section;
}

export async function SectionsDataAdd(section: Section): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_SECTION[DbUtilsGetType()], [
    section.id,
    section.bookId,
    section.parentId,
    section.type,
    section.title,
    section.content,
    section.mediaId,
    section.caption,
    section.orderIndex,
    section.dateCreated,
    section.dateUpdated,
  ]);
}

export async function SectionsDataUpdate(section: Section): Promise<void> {
  section.dateUpdated = new Date().toISOString();
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE_SECTION[DbUtilsGetType()], [
    section.type,
    section.title,
    section.content,
    section.mediaId,
    section.caption,
    section.dateUpdated,
    section.id,
  ]);
}

export async function SectionsDataUpdateOrder(
  id: string,
  orderIndex: number,
): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE_SECTION_ORDER[DbUtilsGetType()], [
    orderIndex,
    id,
  ]);
}

export async function SectionsDataMove(
  id: string,
  newParentId: string,
  orderIndex: number,
): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.MOVE_SECTION[DbUtilsGetType()], [
    newParentId,
    orderIndex,
    new Date().toISOString(),
    id,
  ]);
}

export async function SectionsDataDelete(id: string): Promise<void> {
  // Delete section properties
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTIES[DbUtilsGetType()],
    [id],
  );
  // Recursively delete children
  const children = await SectionsDataListChildren(id);
  for (const child of children) {
    await SectionsDataDelete(child.id);
  }
  // Delete the section itself
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_SECTION[DbUtilsGetType()], [id]);
}

// ==================== Copy ====================

export async function SectionsDataCopy(
  sourceId: string,
  targetParentId: string,
  orderIndex: number,
): Promise<Section> {
  const source = await SectionsDataGet(sourceId);
  if (!source) {
    return null;
  }
  const copy = new Section();
  copy.bookId = source.bookId;
  copy.parentId = targetParentId;
  copy.title = `${source.title} (copy)`;
  copy.content = source.content;
  copy.orderIndex = orderIndex;
  await SectionsDataAdd(copy);

  // Recursively copy children
  const children = await SectionsDataListChildren(sourceId);
  for (let i = 0; i < children.length; i++) {
    await SectionsDataCopy(children[i].id, copy.id, i);
  }
  return copy;
}

const SQL_QUERIES = {
  GET_SECTION_BY_ID: {
    postgres: 'SELECT * FROM sections WHERE "id" = $1',
    sqlite: "SELECT * FROM sections WHERE id = ?",
  },
  LIST_SECTIONS_BY_BOOK: {
    postgres:
      'SELECT * FROM sections WHERE "bookId" = $1 ORDER BY "orderIndex"',
    sqlite: "SELECT * FROM sections WHERE bookId = ? ORDER BY orderIndex",
  },
  LIST_CHILDREN: {
    postgres:
      'SELECT * FROM sections WHERE "parentId" = $1 ORDER BY "orderIndex"',
    sqlite: "SELECT * FROM sections WHERE parentId = ? ORDER BY orderIndex",
  },
  GET_ROOT_SECTION: {
    postgres:
      'SELECT * FROM sections WHERE "bookId" = $1 AND "parentId" IS NULL',
    sqlite: "SELECT * FROM sections WHERE bookId = ? AND parentId IS NULL",
  },
  INSERT_SECTION: {
    postgres:
      'INSERT INTO sections ("id", "bookId", "parentId", "type", "title", "content", "mediaId", "caption", "orderIndex", "dateCreated", "dateUpdated") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    sqlite:
      "INSERT INTO sections (id, bookId, parentId, type, title, content, mediaId, caption, orderIndex, dateCreated, dateUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  },
  UPDATE_SECTION: {
    postgres:
      'UPDATE sections SET "type" = $1, "title" = $2, "content" = $3, "mediaId" = $4, "caption" = $5, "dateUpdated" = $6 WHERE "id" = $7',
    sqlite:
      "UPDATE sections SET type = ?, title = ?, content = ?, mediaId = ?, caption = ?, dateUpdated = ? WHERE id = ?",
  },
  UPDATE_SECTION_ORDER: {
    postgres: 'UPDATE sections SET "orderIndex" = $1 WHERE "id" = $2',
    sqlite: "UPDATE sections SET orderIndex = ? WHERE id = ?",
  },
  MOVE_SECTION: {
    postgres:
      'UPDATE sections SET "parentId" = $1, "orderIndex" = $2, "dateUpdated" = $3 WHERE "id" = $4',
    sqlite:
      "UPDATE sections SET parentId = ?, orderIndex = ?, dateUpdated = ? WHERE id = ?",
  },
  DELETE_SECTION: {
    postgres: 'DELETE FROM sections WHERE "id" = $1',
    sqlite: "DELETE FROM sections WHERE id = ?",
  },
  DELETE_SECTION_PROPERTIES: {
    postgres: 'DELETE FROM section_properties WHERE "sectionId" = $1',
    sqlite: "DELETE FROM section_properties WHERE sectionId = ?",
  },
};
