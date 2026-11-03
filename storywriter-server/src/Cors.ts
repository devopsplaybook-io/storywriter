import fastifyCors from "@fastify/cors";
import { FastifyInstance } from "fastify";
import { Config } from "./Config";
import { OTelLogger } from "./OTelContext";

const logger = OTelLogger().createModuleLogger("cors");

/**
 * Parse the explicit CORS allow-list. The wildcard is never honoured: the SPA
 * is served same-origin by the same container, so a wildcard only widens the
 * surface without a need.
 */
export function CorsAllowedOrigins(value: string): string[] {
  const origins = String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.includes("*")) {
    logger.warn(
      "CORS_POLICY_ORIGIN wildcard is ignored; configure an explicit origin list",
    );
  }
  return [...new Set(origins.filter((origin) => origin !== "*"))];
}

/**
 * Register CORS only when an explicit origin list is configured. Requests
 * without an Origin header (same-origin navigations, server-to-server calls)
 * are always allowed.
 */
export async function RegisterCors(
  fastify: FastifyInstance,
  config: Config,
): Promise<void> {
  const allowedOrigins = CorsAllowedOrigins(config.CORS_POLICY_ORIGIN);
  if (allowedOrigins.length === 0) {
    return;
  }
  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: "GET,PUT,POST,DELETE",
  });
}
