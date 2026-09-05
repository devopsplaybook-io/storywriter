import { Span } from "@opentelemetry/sdk-trace-base";
import { FastifyInstance, RequestGenericInterface } from "fastify";
import * as jwt from "jsonwebtoken";
import {
  AuthGetUserSession,
  User,
  UsersDataGet,
} from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import {
  ApiTokensDataAdd,
  ApiTokensDataDelete,
  ApiTokensDataGetByToken,
  ApiTokensDataListByUser,
} from "./ApiTokensData";

/**
 * Retrieves the OTel span attached to the request by the
 * `@devopsplaybook.io/otel-utils-fastify` hooks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestSpan(req: any): Span | undefined {
  return req?.tracerSpanApi;
}

/**
 * Generates a long-lived JWT for API access (10-year expiry).
 */
function generateApiToken(user: User, config: Config): string {
  return jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600,
      userId: user.id,
      userName: user.name,
      role: user.role,
      scopes: user.scopes,
      type: "api",
    },
    config.JWT_KEY,
  );
}

/**
 * Resolves the user session, checking both regular JWTs and API tokens.
 * API tokens are verified against the database to support revocation.
 */
export async function resolveUserSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  config: Config,
): Promise<{
  isAuthenticated: boolean;
  userId?: string;
  userName?: string;
  role?: "admin" | "user";
  scopes?: string[];
}> {
  // First try standard JWT auth
  const session = await AuthGetUserSession(req);
  if (session.isAuthenticated) {
    return session;
  }

  // Try API token from Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const tokenValue = authHeader.substring(7);
    const context = requestSpan(req);
    const apiToken = await ApiTokensDataGetByToken(context, tokenValue);
    if (apiToken) {
      // Verify the stored JWT is still valid
      try {
        const decoded = jwt.verify(apiToken.token, config.JWT_KEY) as Record<
          string,
          unknown
        >;
        return {
          isAuthenticated: true,
          userId: decoded.userId as string,
          userName: decoded.userName as string,
          role: decoded.role as "admin" | "user",
          scopes: decoded.scopes as string[] | undefined,
        };
      } catch {
        // Token JWT expired or invalid
      }
    }
  }

  return { isAuthenticated: false };
}

/**
 * API token management routes.
 * Registered separately from the common-utils UsersRoutes.
 */
export class ApiTokensRoutes {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    const config = this.config;

    // List own tokens
    fastify.get("/tokens", async (req, res) => {
      const context = requestSpan(req);
      const userSession = await resolveUserSession(req, config);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const tokens = await ApiTokensDataListByUser(
        context,
        userSession.userId as string,
      );
      // Don't send full token value in list — only prefix
      return res.status(200).send(
        tokens.map((t) => ({
          id: t.id,
          name: t.name,
          dateCreated: t.dateCreated,
          tokenPrefix: t.token.substring(0, 20) + "...",
        })),
      );
    });

    // Create token
    interface PostToken extends RequestGenericInterface {
      Body: { name: string };
    }
    fastify.post<PostToken>("/tokens", async (req, res) => {
      const context = requestSpan(req);
      const userSession = await resolveUserSession(req, config);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const user = await UsersDataGet(
        context,
        userSession.userId as string,
      );
      if (!user) {
        return res.status(404).send({ error: "User Not Found" });
      }
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      // Generate a long-lived JWT (10 years) with type "api"
      const token = generateApiToken(user, config);
      const record = await ApiTokensDataAdd(
        context,
        userSession.userId as string,
        req.body.name,
        token,
      );
      return res.status(201).send({
        id: record.id,
        name: record.name,
        token: record.token,
        dateCreated: record.dateCreated,
      });
    });

    // Delete token
    interface DeleteToken extends RequestGenericInterface {
      Params: { id: string };
    }
    fastify.delete<DeleteToken>("/tokens/:id", async (req, res) => {
      const context = requestSpan(req);
      const userSession = await resolveUserSession(req, config);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      await ApiTokensDataDelete(context, req.params.id);
      return res.status(200).send({});
    });
  }
}
