import { v4 as uuidv4 } from "uuid";

export class BookAttribute {
  public static fromJson(json: Record<string, unknown>): BookAttribute {
    if (!json) {
      return null;
    }
    const attr = new BookAttribute();
    if (json.id) {
      attr.id = json.id as string;
    }
    attr.bookId = json.bookId as string;
    attr.title = (json.title as string) || "";
    attr.content = (json.content as string) || "";
    attr.dateCreated = (json.dateCreated as string) || new Date().toISOString();
    attr.dateUpdated = (json.dateUpdated as string) || new Date().toISOString();
    return attr;
  }

  public id: string;
  public bookId: string;
  public title: string;
  public content: string;
  public dateCreated: string;
  public dateUpdated: string;

  constructor() {
    this.id = uuidv4();
    this.title = "";
    this.content = "";
    this.dateCreated = new Date().toISOString();
    this.dateUpdated = new Date().toISOString();
  }

  public toJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      title: this.title,
      content: this.content,
      dateCreated: this.dateCreated,
      dateUpdated: this.dateUpdated,
    };
  }

  public toTransportJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      title: this.title,
      content: this.content,
      dateCreated: this.dateCreated,
      dateUpdated: this.dateUpdated,
    };
  }
}
