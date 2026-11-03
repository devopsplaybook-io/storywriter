import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PasswordMinimumHint,
  PasswordTooShort,
} from "../utils/passwordPolicy";

describe("password policy", () => {
  it("exposes the server minimum", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("flags passwords shorter than the minimum", () => {
    expect(PasswordTooShort("")).toBe(true);
    expect(PasswordTooShort("short")).toBe(true);
    expect(PasswordTooShort("1234567")).toBe(true);
  });

  it("accepts passwords of the minimum length or longer", () => {
    expect(PasswordTooShort("12345678")).toBe(false);
    expect(PasswordTooShort("a much longer password")).toBe(false);
  });

  it("counts code points, matching the server", () => {
    // Four emoji are four code points (each is a surrogate pair in UTF-16)
    expect(PasswordTooShort("😀😀😀😀")).toBe(true);
    expect(PasswordTooShort("😀😀😀😀😀😀😀😀")).toBe(false);
  });

  it("renders the user-facing hint", () => {
    expect(PasswordMinimumHint()).toBe("At least 8 characters");
  });
});
