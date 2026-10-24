import { Section } from "../model/Section";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import { collectSubtree, subtreeDepth } from "./SectionsTree";

export const MAX_COPY_NODES = 1000;
export const MAX_COPY_DEPTH = 100;
const DELETE_CHUNK_SIZE = 500;
const SECTION_COLUMNS =
  '"id", "bookId", "parentId", "type", "title", "content", "analysis", "mediaId", "caption", "orderIndex", "dateCreated", "dateUpdated"';

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
  bookId: string,
): Promise<Section[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_CHILDREN[DbUtilsGetType()],
    [parentId, bookId],
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
    section.analysis,
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
    section.analysis,
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
    section.analysis,
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

export async function SectionsDataDelete(
  id: string,
  bookId: string,
): Promise<void> {
  const all = await SectionsDataListByBook(bookId);
  const subtree = collectSubtree(id, all);
  const subtreeIds = subtree.map((section) => section.id);
  // Rows from other books may still point at this subtree (data created
  // before cross-book parents were rejected). They must survive the delete,
  // so move them under their own book's root first.
  await SectionsDataDetachForeignChildren(subtreeIds, bookId);
  // Children first so parent rows are never deleted while their children still
  // reference them (PostgreSQL enforces the self-referencing FK).
  const orderedIds = [...subtreeIds].reverse();
  for (let i = 0; i < orderedIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = orderedIds.slice(i, i + DELETE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    await DbUtilsExecSQL(
      `DELETE FROM section_properties WHERE "sectionId" IN (${placeholders})`,
      chunk,
    );
  }
  for (let i = 0; i < orderedIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = orderedIds.slice(i, i + DELETE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    await DbUtilsExecSQL(
      `DELETE FROM sections WHERE "id" IN (${placeholders})`,
      chunk,
    );
  }
}

async function SectionsDataDetachForeignChildren(
  parentIds: string[],
  bookId: string,
): Promise<void> {
  const rootByBook = new Map<string, string | null>();
  for (let i = 0; i < parentIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = parentIds.slice(i, i + DELETE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await DbUtilsQuerySQL(
      `SELECT * FROM sections WHERE "parentId" IN (${placeholders}) AND "bookId" <> ?`,
      [...chunk, bookId],
    );
    for (const raw of rows) {
      const child = Section.fromJson(raw);
      if (!rootByBook.has(child.bookId)) {
        const root = await SectionsDataGetRootSection(child.bookId);
        rootByBook.set(child.bookId, root ? root.id : null);
      }
      await SectionsDataMove(
        child.id,
        rootByBook.get(child.bookId),
        child.orderIndex,
      );
    }
  }
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
  const targetParent = await SectionsDataGet(targetParentId);
  if (!targetParent) {
    throw new Error("Target parent section not found");
  }
  if (targetParent.bookId !== source.bookId) {
    throw new Error("Cannot copy a section into another book");
  }
  const all = await SectionsDataListByBook(source.bookId);
  const subtree = collectSubtree(sourceId, all);
  if (subtree.length > MAX_COPY_NODES) {
    throw new Error(
      `Copy exceeds the maximum of ${MAX_COPY_NODES} sections`,
    );
  }
  if (subtreeDepth(sourceId, all) > MAX_COPY_DEPTH) {
    throw new Error(
      `Copy exceeds the maximum depth of ${MAX_COPY_DEPTH}`,
    );
  }

  // Subtree is parent-first, so a copy's parent copy already exists.
  const copies = new Map<string, Section>();
  const rows = subtree.map((original) => {
    const copy = new Section();
    copy.bookId = original.bookId;
    copy.parentId =
      original.id === sourceId
        ? targetParentId
        : copies.get(original.parentId).id;
    copy.type = original.type;
    copy.title = `${original.title} (copy)`;
    copy.content = original.content;
    copy.mediaId = original.mediaId;
    copy.caption = original.caption;
    copy.orderIndex =
      original.id === sourceId ? orderIndex : original.orderIndex;
    copies.set(original.id, copy);
    return copy;
  });

  await SectionsDataAddMany(rows);
  return copies.get(sourceId);
}

async function SectionsDataAddMany(sections: Section[]): Promise<void> {
  if (sections.length === 0) {
    return;
  }
  const rowPlaceholders = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const sql = `INSERT INTO sections (${SECTION_COLUMNS}) VALUES ${sections
    .map(() => rowPlaceholders)
    .join(", ")}`;
  const params: unknown[] = [];
  for (const section of sections) {
    params.push(
      section.id,
      section.bookId,
      section.parentId,
      section.type,
      section.title,
      section.content,
      section.analysis,
      section.mediaId,
      section.caption,
      section.orderIndex,
      section.dateCreated,
      section.dateUpdated,
    );
  }
  await DbUtilsExecSQL(sql, params);
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
      'SELECT * FROM sections WHERE "parentId" = $1 AND "bookId" = $2 ORDER BY "orderIndex"',
    sqlite:
      "SELECT * FROM sections WHERE parentId = ? AND bookId = ? ORDER BY orderIndex",
  },
  GET_ROOT_SECTION: {
    postgres:
      'SELECT * FROM sections WHERE "bookId" = $1 AND "parentId" IS NULL',
    sqlite: "SELECT * FROM sections WHERE bookId = ? AND parentId IS NULL",
  },
  INSERT_SECTION: {
    postgres:
      'INSERT INTO sections ("id", "bookId", "parentId", "type", "title", "content", "analysis", "mediaId", "caption", "orderIndex", "dateCreated", "dateUpdated") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    sqlite:
      "INSERT INTO sections (id, bookId, parentId, type, title, content, analysis, mediaId, caption, orderIndex, dateCreated, dateUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  },
  UPDATE_SECTION: {
    postgres:
      'UPDATE sections SET "type" = $1, "title" = $2, "content" = $3, "analysis" = $4, "mediaId" = $5, "caption" = $6, "dateUpdated" = $7 WHERE "id" = $8',
    sqlite:
      "UPDATE sections SET type = ?, title = ?, content = ?, analysis = ?, mediaId = ?, caption = ?, dateUpdated = ? WHERE id = ?",
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
};
