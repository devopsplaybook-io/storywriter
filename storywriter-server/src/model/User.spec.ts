import { User } from "./User";

jest.mock("uuid", () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++counter}`),
  };
});

describe("User", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const user = new User();
      expect(user.id).toBe("test-uuid-1");
      expect(user.role).toBe("user");
      expect(user.dateCreated).toBeDefined();
    });
  });

  describe("fromJson", () => {
    it("should return null for null input", () => {
      expect(User.fromJson(null)).toBeNull();
    });

    it("should create a User from JSON data", () => {
      const json = {
        id: "user-1",
        name: "testuser",
        passwordEncrypted: "$2b$10$abc123",
        role: "admin",
      };
      const user = User.fromJson(json);
      expect(user.id).toBe("user-1");
      expect(user.name).toBe("testuser");
      expect(user.passwordEncrypted).toBe("$2b$10$abc123");
      expect(user.role).toBe("admin");
    });

    it("should default role to user", () => {
      const json = { name: "testuser", passwordEncrypted: "hash" };
      const user = User.fromJson(json);
      expect(user.role).toBe("user");
    });
  });

  describe("toJson", () => {
    it("should include all fields", () => {
      const user = new User();
      user.name = "testuser";
      user.passwordEncrypted = "hash";
      const json = user.toJson();
      expect(json.passwordEncrypted).toBe("hash");
      expect(json.role).toBe("user");
    });
  });

  describe("toTransportJson", () => {
    it("should omit passwordEncrypted", () => {
      const user = new User();
      user.name = "testuser";
      user.passwordEncrypted = "secret";
      const transport = user.toTransportJson();
      expect(transport.name).toBe("testuser");
      expect(transport.passwordEncrypted).toBeUndefined();
    });
  });
});
