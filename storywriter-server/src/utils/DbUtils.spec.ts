import { convertToPostgresPlaceholders } from "./DbUtils";

describe("DbUtils", () => {
  describe("convertToPostgresPlaceholders", () => {
    it("should replace ? with $1 for a single placeholder", () => {
      const result = convertToPostgresPlaceholders(
        "SELECT * FROM users WHERE id = ?",
      );
      expect(result).toBe("SELECT * FROM users WHERE id = $1");
    });

    it("should replace multiple ? with sequential $1, $2, etc.", () => {
      const result = convertToPostgresPlaceholders(
        "INSERT INTO users (id, name, role) VALUES (?, ?, ?)",
      );
      expect(result).toBe(
        "INSERT INTO users (id, name, role) VALUES ($1, $2, $3)",
      );
    });

    it("should handle no placeholders", () => {
      const result = convertToPostgresPlaceholders("SELECT * FROM users");
      expect(result).toBe("SELECT * FROM users");
    });

    it("should handle mixed content with placeholders", () => {
      const result = convertToPostgresPlaceholders(
        "UPDATE users SET name = ? WHERE id = ?",
      );
      expect(result).toBe("UPDATE users SET name = $1 WHERE id = $2");
    });
  });
});
