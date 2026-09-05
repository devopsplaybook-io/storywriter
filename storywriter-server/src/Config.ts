import { ConfigBase } from "@devopsplaybook.io/common-utils";
import * as fse from "fs-extra";
import path from "path";
import { OTelLogger } from "./OTelContext";

const logger = OTelLogger().createModuleLogger("config");

export class Config extends ConfigBase {
  // Project-specific OTel defaults
  public OPENTELEMETRY_COLLECTOR_HTTP_TRACES =
    "http://localhost:8080/v1/traces";
  public OPENTELEMETRY_COLLECTOR_HTTP_METRICS =
    "http://localhost:8080/v1/metrics";
  public OPENTELEMETRY_COLLECTOR_HTTP_LOGS = "http://localhost:8080/v1/logs";

  // Application
  public APPLICATION_TITLE = "Storywriter";
  public TMP_DIR = process.env.TMP_DIR || "/tmp";

  // LLM (reserved for future AI features)
  public LLM_API_KEY = "";
  public LLM_API_URL = "https://api.deepseek.com/chat/completions";
  public LLM_MODEL = "deepseek-chat";

  constructor() {
    super("storywriter-server");

    // Override VERSION with storywriter-server's own package.json
    try {
      const pkg = fse.readJsonSync(path.resolve(__dirname, "../package.json"));
      if (pkg && pkg.version) {
        this.VERSION = pkg.version;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      // fallback to default
    }

    // Register project-specific fields so reload() processes them
    this.addConfigField({ field: "APPLICATION_TITLE" });
    this.addConfigField({ field: "API_PORT" });
    this.addConfigField({ field: "TMP_DIR" });
    this.addConfigField({ field: "LLM_API_KEY", sensitive: true });
    this.addConfigField({ field: "LLM_API_URL" });
    this.addConfigField({ field: "LLM_MODEL" });
  }

  public async reload(): Promise<void> {
    await super.reload((message: string) => logger.info(message));
  }
}
