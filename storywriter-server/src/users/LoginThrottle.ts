import { FastifyInstance, FastifyRequest } from "fastify";
import { UsersRoutes } from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import {
  RateLimitPeek,
  RateLimitRecordFailure,
} from "../utils/RateLimit";

function IsLoginRoute(req: FastifyRequest): boolean {
  // routeOptions.url is the full route URL including the prefix
  return (
    req.method === "POST" &&
    (req.routeOptions?.url || "").endsWith("/session")
  );
}

/**
 * Deployment-correct identity for the login throttle: the resolved client IP
 * (which is the forwarded address only when TRUST_PROXY is enabled) plus the
 * normalized username. One user's failures therefore never lock out another
 * user sharing the same proxy IP.
 */
function LoginThrottleKey(req: FastifyRequest): string {
  const body = (req.body ?? {}) as { name?: unknown };
  const name = String(body.name ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 255);
  return `login:${req.ip}:${name}`;
}

/**
 * Register the common-utils user routes behind a login throttle that counts
 * only failed (401) session attempts, keyed on client IP + username. Every
 * other users route passes through untouched.
 */
export async function RegisterUsersRoutesWithLoginThrottle(
  fastify: FastifyInstance,
  config: Config,
): Promise<void> {
  await fastify.register(
    async (instance) => {
      instance.addHook("preHandler", async (req, reply) => {
        if (!IsLoginRoute(req)) {
          return;
        }
        const result = RateLimitPeek(
          LoginThrottleKey(req),
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
      instance.addHook("onResponse", async (req, reply) => {
        // Successful logins and every other outcome leave the budget intact.
        if (!IsLoginRoute(req) || reply.statusCode !== 401) {
          return;
        }
        RateLimitRecordFailure(
          LoginThrottleKey(req),
          config.RATE_LIMIT_LOGIN_WINDOW_MS,
        );
      });
      await new UsersRoutes().getRoutes(instance);
    },
    { prefix: "/api/users" },
  );
}
