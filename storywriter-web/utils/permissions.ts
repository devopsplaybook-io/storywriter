export type BookPermission = "admin" | "owner" | "write" | "read" | null | undefined;

export function canManageAccess(permission: BookPermission): boolean {
  return permission === "admin" || permission === "owner";
}

export function canEditBook(permission: BookPermission): boolean {
  return (
    permission === "admin" ||
    permission === "owner" ||
    permission === "write"
  );
}

export function canDeleteBook(permission: BookPermission): boolean {
  return permission === "admin" || permission === "owner";
}
