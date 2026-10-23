import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import Fastify, { FastifyInstance } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import {
  AuthInit,
  AuthSetOTel,
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
  UsersApiTokensDataSetOTel,
  UsersDataSetOTel,
  UsersRoutes,
} from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import { OTelLogger, OTelSetTracer } from "../OTelContext";
import { BooksRoutes } from "../books/BooksRoutes";
import { SectionsRoutes } from "../sections/SectionsRoutes";
import { PropertiesRoutes } from "../properties/PropertiesRoutes";
import { BookAttributesRoutes } from "../attributes/BookAttributesRoutes";
import { BookAnalysisRoutes } from "../analysis/BookAnalysisRoutes";
import { BookAnalysisInit } from "../analysis/BookAnalysis";
import { LlmClientInit } from "../analysis/LlmClient";
import { MediaRoutes } from "../media/MediaRoutes";

const SQL_DIR = path.join(__dirname, "../../sql/sqlite");

export interface TestUser {
  id: string;
  name: string;
  token: string;
}

/**
 * Route-level test harness: a Fastify instance backed by a throwaway SQLite
 * database in a temporary DATA_DIR, with the same routes and prefixes as
 * `App.ts`.
 */
export class TestServer {
  public app: FastifyInstance;
  public config: Config;
  public dataDir: string;

  public async init(): Promise<void> {
    this.dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "storywriter-test-"),
    );
    this.config = new Config();
    this.config.DATA_DIR = this.dataDir;
    this.config.DATABASE_TYPE = "sqlite";
    this.config.JWT_KEY = "test-jwt-key";
    this.config.OPENTELEMETRY_COLLECTOR_HTTP_TRACES = "";
    this.config.OPENTELEMETRY_COLLECTOR_HTTP_METRICS = "";
    this.config.OPENTELEMETRY_COLLECTOR_HTTP_LOGS = "";
    this.config.CORS_POLICY_ORIGIN = "";

    const tracer = new StandardTracer(this.config);
    OTelSetTracer(tracer);
    DbUtilsSetOTel(tracer, OTelLogger());

    const span = tracer.startSpan("test-init");
    await DbUtilsInit(span, this.config, SQL_DIR);
    AuthSetOTel(tracer);
    UsersDataSetOTel(tracer);
    UsersApiTokensDataSetOTel(tracer);
    await AuthInit(span, this.config, []);
    LlmClientInit(this.config);
    await BookAnalysisInit(this.config);
    span.end();

    this.app = Fastify({ logger: false });
    await this.app.register(fastifyMultipart, {
      limits: { fileSize: 10 * 1024 * 1024 },
    });
    await this.app.register(new UsersRoutes().getRoutes, {
      prefix: "/api/users",
    });
    await this.app.register(
      async (instance) => {
        await new BooksRoutes(this.config).getRoutes(instance);
      },
      { prefix: "/api/books" },
    );
    await this.app.register(
      async (instance) => {
        await new SectionsRoutes().getRoutes(instance);
      },
      { prefix: "/api/sections" },
    );
    await this.app.register(
      async (instance) => {
        await new PropertiesRoutes().getRoutes(instance);
      },
      { prefix: "/api/properties" },
    );
    await this.app.register(
      async (instance) => {
        await new BookAttributesRoutes().getRoutes(instance);
      },
      { prefix: "/api/book-attributes" },
    );
    await this.app.register(
      async (instance) => {
        await new BookAnalysisRoutes().getRoutes(instance);
      },
      { prefix: "/api/books" },
    );
    await this.app.register(
      async (instance) => {
        await new MediaRoutes(this.config).getRoutes(instance);
      },
      { prefix: "/api/books" },
    );
    await this.app.ready();
  }

  /** Create a user. The first call bootstraps the admin (no auth needed). */
  public async createUser(
    name: string,
    role?: "admin" | "user",
    adminToken?: string,
  ): Promise<TestUser> {
    const res = await this.inject("POST", "/api/users", adminToken, {
      name,
      password: "password",
      role,
    });
    if (res.statusCode !== 201) {
      throw new Error(
        `createUser(${name}) failed: ${res.statusCode} ${res.body}`,
      );
    }
    const user = JSON.parse(res.body).user;
    const token = await this.login(name);
    return { id: user.id, name, token };
  }

  public async login(name: string): Promise<string> {
    const res = await this.inject("POST", "/api/users/session", undefined, {
      name,
      password: "password",
    });
    if (res.statusCode !== 201) {
      throw new Error(`login(${name}) failed: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body).token;
  }

  public async createBook(
    token: string,
    name: string,
  ): Promise<{ id: string; ownerId: string }> {
    const res = await this.inject("POST", "/api/books", token, { name });
    if (res.statusCode !== 201) {
      throw new Error(`createBook(${name}) failed: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body);
  }

  public async getRootSection(token: string, bookId: string): Promise<any> {
    const res = await this.inject(
      "GET",
      `/api/sections/root?bookId=${bookId}`,
      token,
    );
    if (res.statusCode !== 200) {
      throw new Error(`getRootSection failed: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body);
  }

  public async exec(sql: string, params: unknown[] = []): Promise<number> {
    return DbUtilsExecSQL(undefined, sql, params);
  }

  public async query(sql: string, params: unknown[] = []): Promise<any[]> {
    return DbUtilsQuerySQL(undefined, sql, params);
  }

  public async inject(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    token?: string,
    payload?: unknown,
  ) {
    const headers: Record<string, string> = {};
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return this.app.inject({
      method,
      url,
      headers,
      payload: payload as any,
    });
  }

  public async close(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
    try {
      DbUtilsGetDatabase()?.close?.();
    } catch {
      // Ignore double-close errors
    }
    if (this.dataDir) {
      await fs.remove(this.dataDir);
    }
  }
}
