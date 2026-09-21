import { StandardMeter, StandardTracer } from "@devopsplaybook.io/otel-utils";
import { StandardTracerFastifyRegisterHooks } from "@devopsplaybook.io/otel-utils-fastify";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { watchFile } from "fs-extra";
import * as path from "path";
import { Config } from "./Config";
import {
  OTelLogger,
  OTelSetMeter,
  OTelSetTracer,
  OTelTracer,
} from "./OTelContext";
import {
  AuthInit,
  AuthSetOTel,
  DbUtilsInit,
  DbUtilsSetOTel,
  UsersDataSetOTel,
  UsersRoutes,
} from "@devopsplaybook.io/common-utils";
import { ApiTokensRoutes } from "./users/ApiTokensRoutes";
import { BooksRoutes } from "./books/BooksRoutes";
import { SectionsRoutes } from "./sections/SectionsRoutes";
import { PropertiesRoutes } from "./properties/PropertiesRoutes";
import { BookAttributesRoutes } from "./attributes/BookAttributesRoutes";
import { BookAnalysisInit } from "./analysis/BookAnalysis";
import { BookAnalysisRoutes } from "./analysis/BookAnalysisRoutes";
import { MediaRoutes } from "./media/MediaRoutes";
import { LegacyMetadataMigrate } from "./utils/LegacyMetadata";

import fastifyCompress from "@fastify/compress";
import fastifyMultipart from "@fastify/multipart";

const logger = OTelLogger().createModuleLogger("app");

logger.info("====== Starting Storywriter Server ======");

Promise.resolve().then(async () => {
  //
  const config = new Config();
  await config.reload();
  watchFile(config.CONFIG_FILE, () => {
    logger.info(`Config updated: ${config.CONFIG_FILE}`);
    config.reload();
  });

  OTelSetTracer(new StandardTracer(config));
  OTelSetMeter(new StandardMeter(config));
  OTelLogger().initOTel(config);

  DbUtilsSetOTel(OTelTracer(), OTelLogger());

  const span = OTelTracer().startSpan("init");

  // Convert pre-v0.2.0 metadata table (key/value) to the common-utils schema
  // (type/value/dateCreated) before DbUtilsInit queries it.
  await LegacyMetadataMigrate(config);

  // Initialize database (runs migrations automatically)
  await DbUtilsInit(
    span,
    config,
    path.join(__dirname, `../sql/${config.DATABASE_TYPE}`),
  );

  // Initialize auth (loads/generates JWT key from metadata table)
  AuthSetOTel(OTelTracer());
  UsersDataSetOTel(OTelTracer());
  await AuthInit(span, config, []);

  await BookAnalysisInit(config);

  span.end();

  // APIs

  const fastify = Fastify({
    logger: {
      level: "error",
    },
  });

  await fastify.register(fastifyCompress, {
    global: true,
    threshold: 1024,
    encodings: ["gzip", "deflate"],
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  });

  if (config.CORS_POLICY_ORIGIN) {
    await fastify.register(fastifyCors, {
      origin: config.CORS_POLICY_ORIGIN,
      methods: "GET,PUT,POST,DELETE",
    });
  }

  StandardTracerFastifyRegisterHooks(fastify, OTelTracer(), OTelLogger(), {
    ignoreList: ["GET-/api/status"],
  });

  fastify.get("/api/status", async () => {
    return { started: true };
  });

  // Register common-utils users routes (session, CRUD, password)
  fastify.register(new UsersRoutes().getRoutes, {
    prefix: "/api/users",
  });

  // Register API tokens routes (extends /api/users with /tokens endpoints)
  await fastify.register(
    async (instance) => {
      await new ApiTokensRoutes(config).getRoutes(instance);
    },
    { prefix: "/api/users" },
  );

  await fastify.register(
    async (instance) => {
      await new BooksRoutes(config).getRoutes(instance);
    },
    { prefix: "/api/books" },
  );

  await fastify.register(
    async (instance) => {
      await new SectionsRoutes().getRoutes(instance);
    },
    { prefix: "/api/sections" },
  );

  await fastify.register(
    async (instance) => {
      await new PropertiesRoutes().getRoutes(instance);
    },
    { prefix: "/api/properties" },
  );

  await fastify.register(
    async (instance) => {
      await new BookAttributesRoutes().getRoutes(instance);
    },
    { prefix: "/api/book-attributes" },
  );

  await fastify.register(
    async (instance) => {
      await new BookAnalysisRoutes().getRoutes(instance);
    },
    { prefix: "/api/books" },
  );

  await fastify.register(
    async (instance) => {
      await new MediaRoutes(config).getRoutes(instance);
    },
    { prefix: "/api/books" },
  );

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, "../web"),
    prefix: "/",
    maxAge: "1d",
    etag: true,
    lastModified: true,
    immutable: true,
    cacheControl: true,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (
      request.raw.url &&
      !request.raw.url.startsWith("/api/") &&
      !path.extname(request.raw.url)
    ) {
      return (reply as any).sendFile("index.html");
    }
    reply.status(404).send({ error: "Not Found" });
  });

  fastify.listen({ port: config.API_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
      logger.error("Error starting API", err);
      process.exit(1);
    }
    logger.info("API Listening");
  });
});
