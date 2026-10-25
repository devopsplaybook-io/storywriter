import { v4 as uuidv4 } from "uuid";

export class BookVersion {
  public static fromJson(json: Record<string, unknown>): BookVersion {
    if (!json) {
      return null;
    }
    const version = new BookVersion();
    if (json.id) {
      version.id = json.id as string;
    }
    version.bookId = json.bookId as string;
    version.versionNumber = (json.versionNumber as number) || 1;
    version.note = (json.note as string) || "";
    version.snapshot = (json.snapshot as string) || "{}";
    if (json.size !== undefined && json.size !== null) {
      version.size = Number(json.size);
    }
    version.dateCreated =
      (json.dateCreated as string) || new Date().toISOString();
    return version;
  }

  public id: string;
  public bookId: string;
  public versionNumber: number;
  public note: string;
  public snapshot: string;
  /** Snapshot size (informational); only set by the metadata queries. */
  public size?: number;
  public dateCreated: string;

  constructor() {
    this.id = uuidv4();
    this.versionNumber = 1;
    this.note = "";
    this.snapshot = "{}";
    this.dateCreated = new Date().toISOString();
  }

  public toJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      versionNumber: this.versionNumber,
      note: this.note,
      snapshot: this.snapshot,
      size: this.size,
      dateCreated: this.dateCreated,
    };
  }

  public toTransportJson(
    options: { includeSnapshot?: boolean } = {},
  ): Record<string, unknown> {
    const json: Record<string, unknown> = {
      id: this.id,
      bookId: this.bookId,
      versionNumber: this.versionNumber,
      note: this.note,
      dateCreated: this.dateCreated,
    };
    if (this.size !== undefined) {
      json.size = this.size;
    }
    if (options.includeSnapshot) {
      json.snapshot = this.snapshot;
    }
    return json;
  }
}
