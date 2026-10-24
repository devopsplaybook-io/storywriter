import { v4 as uuidv4 } from "uuid";

export class Book {
  public static fromJson(json: Record<string, unknown>): Book {
    if (!json) {
      return null;
    }
    const book = new Book();
    if (json.id) {
      book.id = json.id as string;
    }
    book.name = json.name as string;
    book.description = (json.description as string) || "";
    book.dateCreated = (json.dateCreated as string) || new Date().toISOString();
    book.writingGoal = Math.max(0, Math.floor(Number(json.writingGoal) || 0));
    book.ownerId = (json.ownerId as string) || null;
    return book;
  }

  public id: string;
  public name: string;
  public description: string;
  public dateCreated: string;
  public writingGoal: number;
  public ownerId: string | null;

  constructor() {
    this.id = uuidv4();
    this.description = "";
    this.dateCreated = new Date().toISOString();
    this.writingGoal = 0;
    this.ownerId = null;
  }

  public toJson(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      dateCreated: this.dateCreated,
      writingGoal: this.writingGoal,
      ownerId: this.ownerId,
    };
  }

  public toTransportJson(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      dateCreated: this.dateCreated,
      writingGoal: this.writingGoal,
      ownerId: this.ownerId,
    };
  }
}
