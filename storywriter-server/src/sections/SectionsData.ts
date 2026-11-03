import { Section } from "../model/Section";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";
import { collectSubtree, subtreeDepth } from "./SectionsTree";
import { DbUtilsTransaction } from "../utils/DbTransaction";
import { PropertiesDataGetAllSectionValuesForBook } from "../properties/PropertiesData";
import { BookContentVersionBump } from "../books/BookContentVersion";

export const MAX_COPY_NODES = 1000;
export const MAX_COPY_DEPTH = 100;
const DELETE_CHUNK_SIZE = 500;
const SECTION_COLUMNS =
  '"id", "bookId", "parentId", "type", "title", "content", "analysis", "mediaId", "caption", "orderIndex", "dateCreated", "dateUpdated"';

/**
 * Thrown by SectionsDataUpdate when an expected revision was given and the
 * section was modified by someone else in the meantime (no rows updated).
 */
export class SectionsConflictError extends Error {
  public section: Section;

  constructor(section: Section) {
    super("Section was modified by someone else");
    this.name = "SectionsConflictError";
    this.section = section;
  }
}

/**
 * Thrown by SectionsDataUpdateAnalysis when the AI notes were changed by
 * someone else while the notes were being generated. Carries both versions so
 * the caller can offer them to the user.
 */
export class SectionsAnalysisConflictError extends Error {
  public section: Section;
  public generatedAnalysis: string;

  constructor(section: Section, generatedAnalysis: string) {
    super("AI notes changed while generating");
    this.name = "SectionsAnalysisConflictError";
    this.section = section;
    this.generatedAnalysis = generatedAnalysis;
  }
}

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

/**
 * Update a section's fields and bump its revision. When `expectedRevision`
 * is given, the update only applies while the stored revision still matches;
 * a stale write throws SectionsConflictError carrying the current section.
 */
export async function SectionsDataUpdate(
  section: Section,
  expectedRevision?: number,
): Promise<void> {
  section.dateUpdated = new Date().toISOString();
  const queries = expectedRevision === undefined
    ? SQL_QUERIES.UPDATE_SECTION
    : SQL_QUERIES.UPDATE_SECTION_IF_REVISION;
  const params =
    expectedRevision === undefined
      ? [
          section.type,
          section.title,
          section.content,
          section.analysis,
          section.mediaId,
          section.caption,
          section.dateUpdated,
          section.id,
        ]
      : [
          section.type,
          section.title,
          section.content,
          section.analysis,
          section.mediaId,
          section.caption,
          section.dateUpdated,
          section.id,
          expectedRevision,
        ];
  const affected = await DbUtilsExecSQL(queries[DbUtilsGetType()], params);
  if (expectedRevision !== undefined && affected === 0) {
    const current = await SectionsDataGet(section.id);
    if (current) {
      throw new SectionsConflictError(current);
    }
    throw new SectionsConflictError(section);
  }
  // Keep the caller's object in sync with the bumped DB revision so the
  // response reports the revision the row now carries.
  section.revision = (expectedRevision ?? section.revision) + 1;
}

/**
 * Save AI notes only, without touching title/content/caption/type, and bump
 * the revision. The update applies only while the stored analysis still equals
 * `expectedAnalysis`, so notes edited manually during generation are never
 * silently overwritten. Concurrent content edits are preserved because the
 * statement never writes those columns.
 */
export async function SectionsDataUpdateAnalysis(
  id: string,
  analysis: string,
  expectedAnalysis: string,
): Promise<Section> {
  return DbUtilsTransaction(async () => {
    const affected = await DbUtilsExecSQL(
      SQL_QUERIES.UPDATE_SECTION_ANALYSIS[DbUtilsGetType()],
      [analysis, new Date().toISOString(), id, expectedAnalysis || ""],
    );
    const current = await SectionsDataGet(id);
    if (affected === 0 || !current) {
      throw new SectionsAnalysisConflictError(current, analysis);
    }
    if (analysis !== (expectedAnalysis || "")) {
      await BookContentVersionBump(current.bookId);
    }
    return current;
  });
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

/**
 * Apply a new sibling order for one parent atomically: the caller has already
 * validated that `orderedIds` is an exact permutation of the parent's current
 * children. Each id is written at its list position inside one transaction,
 * together with the book content-version bump.
 */
export async function SectionsDataReorder(
  parentId: string,
  bookId: string,
  orderedIds: string[],
): Promise<void> {
  await DbUtilsTransaction(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await DbUtilsExecSQL(
        SQL_QUERIES.UPDATE_SECTION_ORDER_IN_PARENT[DbUtilsGetType()],
        [i, orderedIds[i], parentId],
      );
    }
    await BookContentVersionBump(bookId);
  });
}

export async function SectionsDataDelete(
  id: string,
  bookId: string,
): Promise<void> {
  // All-or-nothing: a failure must not leave partially deleted or detached
  // sections behind.
  await DbUtilsTransaction(async () => {
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
    await BookContentVersionBump(bookId);
  });
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

  // Section-type labels travel with the copy; AI notes stay empty (they are
  // regenerable content, not part of the duplicated manuscript).
  const copiedIds = new Set(subtree.map((section) => section.id));
  const propertyValues =
    await PropertiesDataGetAllSectionValuesForBook(source.bookId);
  const copiedValues = propertyValues
    .filter((value) => copiedIds.has(value.sectionId))
    .map((value) => ({
      sectionId: copies.get(value.sectionId).id,
      propertyId: value.propertyId,
      value: value.value,
    }));

  // Sections and their labels are inserted atomically: a failed copy leaves
  // no partial tree and no orphaned assignments.
  await DbUtilsTransaction(async () => {
    await SectionsDataAddMany(rows);
    if (copiedValues.length > 0) {
      const placeholders = copiedValues.map(() => "(?, ?, ?)").join(", ");
      const params = copiedValues.flatMap((value) => [
        value.sectionId,
        value.propertyId,
        value.value,
      ]);
      await DbUtilsExecSQL(
        `INSERT INTO section_properties (sectionId, propertyId, value) VALUES ${placeholders}`,
        params,
      );
    }
    await BookContentVersionBump(source.bookId);
  });
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
      'UPDATE sections SET "type" = $1, "title" = $2, "content" = $3, "analysis" = $4, "mediaId" = $5, "caption" = $6, "revision" = "revision" + 1, "dateUpdated" = $7 WHERE "id" = $8',
    sqlite:
      "UPDATE sections SET type = ?, title = ?, content = ?, analysis = ?, mediaId = ?, caption = ?, revision = revision + 1, dateUpdated = ? WHERE id = ?",
  },
  UPDATE_SECTION_IF_REVISION: {
    postgres:
      'UPDATE sections SET "type" = $1, "title" = $2, "content" = $3, "analysis" = $4, "mediaId" = $5, "caption" = $6, "revision" = "revision" + 1, "dateUpdated" = $7 WHERE "id" = $8 AND "revision" = $9',
    sqlite:
      "UPDATE sections SET type = ?, title = ?, content = ?, analysis = ?, mediaId = ?, caption = ?, revision = revision + 1, dateUpdated = ? WHERE id = ? AND revision = ?",
  },
  UPDATE_SECTION_ANALYSIS: {
    postgres:
      'UPDATE sections SET "analysis" = $1, "revision" = "revision" + 1, "dateUpdated" = $2 WHERE "id" = $3 AND COALESCE("analysis", \'\') = $4',
    sqlite:
      "UPDATE sections SET analysis = ?, revision = revision + 1, dateUpdated = ? WHERE id = ? AND COALESCE(analysis, '') = ?",
  },
  UPDATE_SECTION_ORDER: {
    postgres: 'UPDATE sections SET "orderIndex" = $1 WHERE "id" = $2',
    sqlite: "UPDATE sections SET orderIndex = ? WHERE id = ?",
  },
  UPDATE_SECTION_ORDER_IN_PARENT: {
    postgres:
      'UPDATE sections SET "orderIndex" = $1 WHERE "id" = $2 AND "parentId" = $3',
    sqlite:
      "UPDATE sections SET orderIndex = ? WHERE id = ? AND parentId = ?",
  },
  MOVE_SECTION: {
    postgres:
      'UPDATE sections SET "parentId" = $1, "orderIndex" = $2, "dateUpdated" = $3 WHERE "id" = $4',
    sqlite:
      "UPDATE sections SET parentId = ?, orderIndex = ?, dateUpdated = ? WHERE id = ?",
  },
};
