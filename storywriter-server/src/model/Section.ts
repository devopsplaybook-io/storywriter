import { v4 as uuidv4 } from "uuid";

export type SectionType = "text" | "container" | "media";

export class Section {
  public static fromJson(json: Record<string, unknown>): Section {
    if (!json) {
      return null;
    }
    const section = new Section();
    if (json.id) {
      section.id = json.id as string;
    }
    section.bookId = json.bookId as string;
    section.parentId = (json.parentId as string) || null;
    section.type = (json.type as SectionType) || "text";
    section.title = (json.title as string) || "";
    section.content = (json.content as string) || "";
    section.analysis = (json.analysis as string) || "";
    section.mediaId = (json.mediaId as string) || null;
    section.caption = (json.caption as string) || "";
    section.orderIndex = (json.orderIndex as number) || 0;
    section.version = (json.version as number) || 1;
    section.dateCreated =
      (json.dateCreated as string) || new Date().toISOString();
    section.dateUpdated =
      (json.dateUpdated as string) || new Date().toISOString();
    return section;
  }

  public id: string;
  public bookId: string;
  public parentId: string | null;
  public type: SectionType;
  public title: string;
  public content: string;
  public analysis: string;
  public mediaId: string | null;
  public caption: string;
  public orderIndex: number;
  public version: number;
  public dateCreated: string;
  public dateUpdated: string;

  constructor() {
    this.id = uuidv4();
    this.parentId = null;
    this.type = "text";
    this.title = "";
    this.content = "";
    this.analysis = "";
    this.mediaId = null;
    this.caption = "";
    this.orderIndex = 0;
    this.version = 1;
    this.dateCreated = new Date().toISOString();
    this.dateUpdated = new Date().toISOString();
  }

  public toJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      parentId: this.parentId,
      type: this.type,
      title: this.title,
      content: this.content,
      analysis: this.analysis,
      mediaId: this.mediaId,
      caption: this.caption,
      orderIndex: this.orderIndex,
      version: this.version,
      dateCreated: this.dateCreated,
      dateUpdated: this.dateUpdated,
    };
  }

  public toTransportJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      parentId: this.parentId,
      type: this.type,
      title: this.title,
      content: this.content,
      analysis: this.analysis,
      mediaId: this.mediaId,
      caption: this.caption,
      orderIndex: this.orderIndex,
      version: this.version,
      dateCreated: this.dateCreated,
      dateUpdated: this.dateUpdated,
    };
  }
}
