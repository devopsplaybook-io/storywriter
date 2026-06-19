import { User } from "../model/User";
import * as bcrypt from "bcrypt";
import {
  UserPasswordSetPassword,
  UserPasswordCheckPassword,
} from "./UserPassword";

jest.mock("bcrypt", () => ({
  genSalt: jest.fn().mockResolvedValue("test-salt"),
  hash: jest.fn().mockResolvedValue("$2b$10$hashedpassword"),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

// Import after mocks are set up
// Using hoisted imports - jest.mock is hoisted above imports

describe("UserPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("UserPasswordSetPassword", () => {
    it("should generate salt and hash the password", async () => {
      const user = new User();
      await UserPasswordSetPassword(user, "mypassword");

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith("mypassword", "test-salt");
      expect(user.passwordEncrypted).toBe("$2b$10$hashedpassword");
    });
  });

  describe("UserPasswordCheckPassword", () => {
    it("should compare the password with stored hash", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const user = new User();
      user.passwordEncrypted = "$2b$10$storedhash";
      const result = await UserPasswordCheckPassword(user, "mypassword");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "mypassword",
        "$2b$10$storedhash",
      );
      expect(result).toBe(true);
    });

    it("should return false for wrong password", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      const user = new User();
      user.passwordEncrypted = "$2b$10$storedhash";
      const result = await UserPasswordCheckPassword(user, "wrongpassword");

      expect(result).toBe(false);
    });
  });
});
