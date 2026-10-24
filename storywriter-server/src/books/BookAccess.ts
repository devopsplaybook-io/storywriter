import { AuthGetUserSession } from "@devopsplaybook.io/common-utils";
import { Book } from "../model/Book";
import { BooksDataGet, BooksDataGetUserAccess } from "./BooksData";

export type BookAccessLevel = "read" | "write" | "owner" | "admin";

/**
 * Resolve the requesting user's access level on a book.
 * Returns null when the user is unauthenticated, the book is missing or the
 * user has no grant. Admins bypass every check; owners have implicit full
 * access even without a book_access row.
 */
export async function BookAccessGet(
  req: any,
  book: Book,
  session?: any,
): Promise<BookAccessLevel | null> {
  if (!book) {
    return null;
  }
  const userSession = session || (await AuthGetUserSession(req));
  if (!userSession.isAuthenticated) {
    return null;
  }
  if (userSession.role === "admin") {
    return "admin";
  }
  if (book.ownerId && book.ownerId === userSession.userId) {
    return "owner";
  }
  const access = await BooksDataGetUserAccess(book.id, userSession.userId);
  if (access === "write" || access === "read") {
    return access;
  }
  return null;
}

/**
 * Require at least read (default) or write access to a book.
 * Sends 403 when unauthenticated/unauthorized and 404 when the book is
 * missing (unless the book object was resolved by the caller).
 */
export async function CheckBookAccess(
  req: any,
  res: any,
  bookId: string,
  required: "read" | "write" = "read",
  book?: Book,
): Promise<boolean> {
  const userSession = await AuthGetUserSession(req);
  if (!userSession.isAuthenticated) {
    res.status(403).send({ error: "Access Denied" });
    return false;
  }
  const target = book || (await BooksDataGet(bookId));
  if (!target) {
    res.status(404).send({ error: "Book Not Found" });
    return false;
  }
  const level = await BookAccessGet(req, target, userSession);
  if (!level) {
    res.status(403).send({ error: "Access Denied" });
    return false;
  }
  if (required === "write" && level === "read") {
    res.status(403).send({ error: "Write Access Required" });
    return false;
  }
  return true;
}

/**
 * Require the book owner or an admin (access management and book deletion).
 */
export async function CheckBookOwnerOrAdmin(
  req: any,
  res: any,
  bookId: string,
  book?: Book,
): Promise<boolean> {
  const userSession = await AuthGetUserSession(req);
  if (!userSession.isAuthenticated) {
    res.status(403).send({ error: "Access Denied" });
    return false;
  }
  const target = book || (await BooksDataGet(bookId));
  if (!target) {
    res.status(404).send({ error: "Book Not Found" });
    return false;
  }
  if (userSession.role === "admin") {
    return true;
  }
  if (target.ownerId && target.ownerId === userSession.userId) {
    return true;
  }
  res.status(403).send({ error: "Owner Access Required" });
  return false;
}
