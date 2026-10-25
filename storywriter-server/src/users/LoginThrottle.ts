import { FastifyInstance } from "fastify";
import { UsersRoutes } from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import { RateLimitCheck } from "../utils/RateLimit";

/**
 * Register the common-utils user routes behind a per-IP login throttle: only
 * POSTs to the session route consume the fixed-window counter; every other
 * users route passes through untouched.
 */
export async function RegisterUsersRoutesWithLoginThrottle(
  fastify: FastifyInstance,
  config: Config,
): Promise<void> {
  await fastify.register(
    async (instance) => {
      instance.addHook("preHandler", async (req, reply) => {
        // routeOptions.url is the full route URL including the prefix
        const url = req.routeOptions?.url || "";
        if (req.method !== "POST" || !url.endsWith("/session")) {
          return;
        }
        const result = RateLimitCheck(
          `login:${req.ip}`,
          config.RATE_LIMIT_LOGIN_MAX,
          config.RATE_LIMIT_LOGIN_WINDOW_MS,
        );
        if (!result.allowed) {
          reply.header("Retry-After", String(result.retryAfterSeconds));
          return reply.status(429).send({
            error: "Too many login attempts, try again later",
          });
        }
      });
      await new UsersRoutes().getRoutes(instance);
    },
    { prefix: "/api/users" },
  );
}
