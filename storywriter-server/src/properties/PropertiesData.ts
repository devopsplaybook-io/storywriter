import { Property } from "../model/Property";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsGetType,
} from "../utils/DbUtils";

// ==================== Property Definitions ====================

export async function PropertiesDataGet(id: string): Promise<Property> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_PROPERTY_BY_ID[DbUtilsGetType()],
    [id],
  );
  if (rows.length === 0) return null;
  return Property.fromJson(rows[0]);
}

export async function PropertiesDataListByBook(
  bookId: string,
): Promise<Property[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.LIST_PROPERTIES_BY_BOOK[DbUtilsGetType()],
    [bookId],
  );
  return rows.map((raw) => Property.fromJson(raw));
}

export async function PropertiesDataAdd(property: Property): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.INSERT_PROPERTY[DbUtilsGetType()], [
    property.id,
    property.bookId,
    property.name,
    property.type,
    JSON.stringify(property.options),
    property.dateCreated,
  ]);
}

export async function PropertiesDataUpdate(property: Property): Promise<void> {
  await DbUtilsExecSQL(SQL_QUERIES.UPDATE_PROPERTY[DbUtilsGetType()], [
    property.name,
    property.type,
    JSON.stringify(property.options),
    property.id,
  ]);
}

export async function PropertiesDataDelete(id: string): Promise<void> {
  // Delete section property values first
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTY_VALUES[DbUtilsGetType()],
    [id],
  );
  await DbUtilsExecSQL(SQL_QUERIES.DELETE_PROPERTY[DbUtilsGetType()], [id]);
}

// ==================== Section Property Values ====================

export async function PropertiesDataGetSectionValues(
  sectionId: string,
): Promise<{ propertyId: string; value: string }[]> {
  const rows = await DbUtilsQuerySQL(
    SQL_QUERIES.GET_SECTION_PROPERTY_VALUES[DbUtilsGetType()],
    [sectionId],
  );
  return rows.map((r) => ({ propertyId: r.propertyId, value: r.value }));
}

export async function PropertiesDataSetSectionValue(
  sectionId: string,
  propertyId: string,
  value: string,
): Promise<void> {
  if (DbUtilsGetType() === "sqlite") {
    await DbUtilsExecSQL(
      SQL_QUERIES.UPSERT_SECTION_PROPERTY_VALUE[DbUtilsGetType()],
      [sectionId, propertyId, value, value],
    );
  } else {
    await DbUtilsExecSQL(
      SQL_QUERIES.UPSERT_SECTION_PROPERTY_VALUE[DbUtilsGetType()],
      [sectionId, propertyId, value],
    );
  }
}

export async function PropertiesDataRemoveSectionValue(
  sectionId: string,
  propertyId: string,
): Promise<void> {
  await DbUtilsExecSQL(
    SQL_QUERIES.DELETE_SECTION_PROPERTY_VALUE[DbUtilsGetType()],
    [sectionId, propertyId],
  );
}

const SQL_QUERIES = {
  GET_PROPERTY_BY_ID: {
    postgres: 'SELECT * FROM book_properties WHERE "id" = $1',
    sqlite: "SELECT * FROM book_properties WHERE id = ?",
  },
  LIST_PROPERTIES_BY_BOOK: {
    postgres:
      'SELECT * FROM book_properties WHERE "bookId" = $1 ORDER BY "name"',
    sqlite: "SELECT * FROM book_properties WHERE bookId = ? ORDER BY name",
  },
  INSERT_PROPERTY: {
    postgres:
      'INSERT INTO book_properties ("id", "bookId", "name", "type", "options", "dateCreated") VALUES ($1, $2, $3, $4, $5, $6)',
    sqlite:
      "INSERT INTO book_properties (id, bookId, name, type, options, dateCreated) VALUES (?, ?, ?, ?, ?, ?)",
  },
  UPDATE_PROPERTY: {
    postgres:
      'UPDATE book_properties SET "name" = $1, "type" = $2, "options" = $3 WHERE "id" = $4',
    sqlite:
      "UPDATE book_properties SET name = ?, type = ?, options = ? WHERE id = ?",
  },
  DELETE_PROPERTY: {
    postgres: 'DELETE FROM book_properties WHERE "id" = $1',
    sqlite: "DELETE FROM book_properties WHERE id = ?",
  },
  DELETE_SECTION_PROPERTY_VALUES: {
    postgres: 'DELETE FROM section_properties WHERE "propertyId" = $1',
    sqlite: "DELETE FROM section_properties WHERE propertyId = ?",
  },
  GET_SECTION_PROPERTY_VALUES: {
    postgres: 'SELECT * FROM section_properties WHERE "sectionId" = $1',
    sqlite: "SELECT * FROM section_properties WHERE sectionId = ?",
  },
  UPSERT_SECTION_PROPERTY_VALUE: {
    postgres:
      'INSERT INTO section_properties ("sectionId", "propertyId", "value") VALUES ($1, $2, $3) ON CONFLICT ("sectionId", "propertyId") DO UPDATE SET "value" = $3',
    sqlite:
      "INSERT INTO section_properties (sectionId, propertyId, value) VALUES (?, ?, ?) ON CONFLICT (sectionId, propertyId) DO UPDATE SET value = ?",
  },
  DELETE_SECTION_PROPERTY_VALUE: {
    postgres:
      'DELETE FROM section_properties WHERE "sectionId" = $1 AND "propertyId" = $2',
    sqlite:
      "DELETE FROM section_properties WHERE sectionId = ? AND propertyId = ?",
  },
};
