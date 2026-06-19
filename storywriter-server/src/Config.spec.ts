jest.mock("fs-extra", () => ({
  ...jest.requireActual("fs-extra"),
  readJson: jest.fn(),
}));

const fsMock = jest.requireMock("fs-extra") as {
  readJson: jest.Mock;
};

import { Config } from "./Config";

describe("Config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DATA_DIR;
    delete process.env.DEV_MODE;
    delete process.env.API_PORT;
    delete process.env.CORS_POLICY_ORIGIN;
    delete process.env.APPLICATION_TITLE;
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const config = new Config();
      expect(config.APPLICATION_TITLE).toBe("Storywriter");
      expect(config.API_PORT).toBe(8080);
      expect(config.DATABASE_TYPE).toBe("sqlite");
      expect(config.JWT_VALIDITY_DURATION).toBe(3600 * 24 * 30);
      expect(config.LLM_API_URL).toBe(
        "https://api.deepseek.com/chat/completions",
      );
      expect(config.LLM_MODEL).toBe("deepseek-chat");
    });

    it("should read DATA_DIR from environment", () => {
      process.env.DATA_DIR = "/custom/data";
      const config = new Config();
      expect(config.DATA_DIR).toBe("/custom/data");
    });

    it("should default DATA_DIR to /data", () => {
      const config = new Config();
      expect(config.DATA_DIR).toBe("/data");
    });
  });

  describe("reload", () => {
    it("should load values from config file", async () => {
      fsMock.readJson.mockResolvedValueOnce({
        APPLICATION_TITLE: "My Storywriter",
        API_PORT: 9090,
        JWT_KEY: "my-secret-key",
      });

      const config = new Config();
      await config.reload();

      expect(config.APPLICATION_TITLE).toBe("My Storywriter");
      expect(config.API_PORT).toBe(9090);
      expect(config.JWT_KEY).toBe("my-secret-key");
    });

    it("should use defaults for missing config values", async () => {
      fsMock.readJson.mockResolvedValueOnce({});

      const config = new Config();
      await config.reload();

      // JWT_KEY defaults to "dev" from reload() logic
      expect(config.JWT_KEY).toBe("dev");
      expect(config.APPLICATION_TITLE).toBe("Storywriter");
    });

    it("should override config file values with environment variables", async () => {
      process.env.APPLICATION_TITLE = "Env Title";
      process.env.API_PORT = "3000";

      fsMock.readJson.mockResolvedValueOnce({
        APPLICATION_TITLE: "File Title",
        API_PORT: 8080,
      });

      const config = new Config();
      await config.reload();

      expect(config.APPLICATION_TITLE).toBe("Env Title");
      expect(config.API_PORT).toBe(3000);
    });
  });
});
