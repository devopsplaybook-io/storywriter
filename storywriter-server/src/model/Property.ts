import { v4 as uuidv4 } from "uuid";

export type PropertyType = "section-type";

export class Property {
  public static fromJson(json: Record<string, unknown>): Property {
    if (!json) {
      return null;
    }
    const property = new Property();
    if (json.id) {
      property.id = json.id as string;
    }
    property.bookId = json.bookId as string;
    property.name = json.name as string;
    property.type = (json.type as PropertyType) || "section-type";
    try {
      property.options =
        typeof json.options === "string"
          ? JSON.parse(json.options as string)
          : (json.options as string[]) || [];
    } catch {
      property.options = [];
    }
    property.dateCreated =
      (json.dateCreated as string) || new Date().toISOString();
    return property;
  }

  public id: string;
  public bookId: string;
  public name: string;
  public type: PropertyType;
  public options: string[];
  public dateCreated: string;

  constructor() {
    this.id = uuidv4();
    this.type = "section-type";
    this.options = [];
    this.dateCreated = new Date().toISOString();
  }

  public toJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      name: this.name,
      type: this.type,
      options: JSON.stringify(this.options),
      dateCreated: this.dateCreated,
    };
  }

  public toTransportJson(): Record<string, unknown> {
    return {
      id: this.id,
      bookId: this.bookId,
      name: this.name,
      type: this.type,
      options: this.options,
      dateCreated: this.dateCreated,
    };
  }
}
