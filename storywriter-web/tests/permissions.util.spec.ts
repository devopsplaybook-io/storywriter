import { describe, expect, it } from "vitest";
import {
  canDeleteBook,
  canEditBook,
  canManageAccess,
} from "../utils/permissions";

describe("permissions util", () => {
  it("allows access management for owners and admins only", () => {
    expect(canManageAccess("admin")).toBe(true);
    expect(canManageAccess("owner")).toBe(true);
    expect(canManageAccess("write")).toBe(false);
    expect(canManageAccess("read")).toBe(false);
    expect(canManageAccess(null)).toBe(false);
    expect(canManageAccess(undefined)).toBe(false);
  });

  it("allows editing for owners, admins and writers", () => {
    expect(canEditBook("admin")).toBe(true);
    expect(canEditBook("owner")).toBe(true);
    expect(canEditBook("write")).toBe(true);
    expect(canEditBook("read")).toBe(false);
    expect(canEditBook(null)).toBe(false);
    expect(canEditBook(undefined)).toBe(false);
  });

  it("allows deletion for owners and admins only", () => {
    expect(canDeleteBook("admin")).toBe(true);
    expect(canDeleteBook("owner")).toBe(true);
    expect(canDeleteBook("write")).toBe(false);
    expect(canDeleteBook("read")).toBe(false);
    expect(canDeleteBook(null)).toBe(false);
    expect(canDeleteBook(undefined)).toBe(false);
  });
});
