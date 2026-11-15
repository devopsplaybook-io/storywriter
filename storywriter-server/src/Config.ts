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

  // Versioning: keep at most this many versions per book (oldest pruned)
  public VERSIONS_MAX_PER_BOOK = 50;

  // LLM (reserved for future AI features)
  public LLM_API_KEY = "";
  public LLM_API_URL = "https://api.deepseek.com/chat/completions";
  public LLM_MODEL = "deepseek-chat";
  public LLM_TIMEOUT_MS = 45000;
  public LLM_OVERALL_TIMEOUT_MS = 120000;

  // Rate limiting / concurrency caps
  public RATE_LIMIT_LOGIN_MAX = 10;
  public RATE_LIMIT_LOGIN_WINDOW_MS = 300000;
  public LLM_USER_CONCURRENCY = 1;
  public LLM_DAILY_QUOTA = 100;
  public IMPORT_EXPORT_CONCURRENCY = 2;

  // Authentication
  // Trust X-Forwarded-For only when the deployment runs behind a trusted
  // reverse proxy (the bundled config sets it for the proxied deployment).
  public TRUST_PROXY = false;
  public PASSWORD_MIN_LENGTH = 8;
  // common-utils 2.6.0 dropped its access-token default from 93 days to 1 hour,
  // expecting clients to renew with POST /session; this client only renews when
  // a page loads (stores/auth.ts), so an hourly default would sign active users
  // out mid-session. Keep a long lifetime; the library still caps every token
  // at JWT_SESSION_MAX_DURATION (30 days) after the first sign-in.
  public JWT_VALIDITY_DURATION = 30 * 24 * 3600;

  // Manuscript export budgets: the whole content, and every referenced media
  // file combined, must fit these budgets or the export fails with 413
  public EXPORT_MAX_CONTENT_BYTES = 20 * 1024 * 1024;
  public EXPORT_MAX_TOTAL_MEDIA_BYTES = 100 * 1024 * 1024;

  constructor() {
    super("storywriter-server");

    // Override VERSION with storywriter-server's own package.json
    try {
      const pkg = fse.readJsonSync(path.resolve(__dirname, "../package.json"));
      if (pkg && pkg.version) {
        this.VERSION = pkg.version;
      }
      // eslint-disable-next-line no-unused-vars
    } catch (_e) {
      // fallback to default
    }

    // Register project-specific fields so reload() processes them
    this.addConfigField({ field: "APPLICATION_TITLE" });
    this.addConfigField({ field: "API_PORT" });
    this.addConfigField({ field: "TMP_DIR" });
    this.addConfigField({ field: "VERSIONS_MAX_PER_BOOK" });
    this.addConfigField({ field: "LLM_API_KEY", sensitive: true });
    this.addConfigField({ field: "LLM_API_URL" });
    this.addConfigField({ field: "LLM_MODEL" });
    this.addConfigField({ field: "LLM_TIMEOUT_MS" });
    this.addConfigField({ field: "LLM_OVERALL_TIMEOUT_MS" });
    this.addConfigField({ field: "RATE_LIMIT_LOGIN_MAX" });
    this.addConfigField({ field: "RATE_LIMIT_LOGIN_WINDOW_MS" });
    this.addConfigField({ field: "TRUST_PROXY" });
    this.addConfigField({ field: "PASSWORD_MIN_LENGTH" });
    // Re-registering the inherited field is what makes reload() use this
    // class's value as the default instead of the ConfigBase one.
    this.addConfigField({ field: "JWT_VALIDITY_DURATION" });
    this.addConfigField({ field: "LLM_USER_CONCURRENCY" });
    this.addConfigField({ field: "LLM_DAILY_QUOTA" });
    this.addConfigField({ field: "IMPORT_EXPORT_CONCURRENCY" });
    this.addConfigField({ field: "EXPORT_MAX_CONTENT_BYTES" });
    this.addConfigField({ field: "EXPORT_MAX_TOTAL_MEDIA_BYTES" });
  }

  public async reload(): Promise<void> {
    await super.reload((message: string) => logger.info(message));
  }
}
