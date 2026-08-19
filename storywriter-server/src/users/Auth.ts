import * as jwt from "jsonwebtoken";
import { Config } from "../Config";
import { User } from "../model/User";
import { UserSession } from "../model/UserSession";

import { ApiTokensDataGetByToken } from "./ApiTokensData";

let config: Config;

export async function AuthInit(configIn: Config): Promise<void> {
  config = configIn;
}

export async function AuthGenerateJWT(
  user: User,
  type: "session" | "api" = "session",
): Promise<string> {
  const payload: Record<string, unknown> = {
    userId: user.id,
    userName: user.name,
    role: user.role,
    type,
  };
  if (type === "session") {
    payload.exp = Math.floor(Date.now() / 1000) + config.JWT_VALIDITY_DURATION;
  } else {
    // API tokens: 10-year expiry
    payload.exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  }
  return jwt.sign(payload, config.JWT_KEY);
}

function jwtDecodeCached(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Record<string, unknown> | null {
  if (req._jwtPayload) {
    return req._jwtPayload;
  }
  let token: string | null = null;
  if (req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.query?.token) {
    token = req.query.token as string;
  }
  if (!token) {
    return null;
  }
  try {
    const info = jwt.verify(token, config.JWT_KEY) as Record<string, unknown>;
    req._jwtPayload = info;
    return info;
  } catch {
    return null;
  }
}

// Resolve user session from JWT or API token
async function resolveSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Promise<UserSession> {
  const userSession: UserSession = { isAuthenticated: false };
  const info = jwtDecodeCached(req);
  if (info) {
    userSession.userId = info.userId as string;
    userSession.userName = info.userName as string;
    userSession.role = info.role as "admin" | "user";
    userSession.isAuthenticated = true;
    return userSession;
  }
  // Try API token from Authorization header (Bearer token not decoded as JWT)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const tokenValue = authHeader.substring(7);
    const apiToken = await ApiTokensDataGetByToken(tokenValue);
    if (apiToken) {
      // Decode the stored JWT to get user info
      try {
        const decoded = jwt.verify(apiToken.token, config.JWT_KEY) as Record<
          string,
          unknown
        >;
        userSession.userId = decoded.userId as string;
        userSession.userName = decoded.userName as string;
        userSession.role = decoded.role as "admin" | "user";
        userSession.isAuthenticated = true;
        req._jwtPayload = decoded;
      } catch {
        // Token JWT expired or invalid
      }
    }
  }
  return userSession;
}

export async function AuthMustBeAuthenticated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
): Promise<void> {
  if (!jwtDecodeCached(req)) {
    res.status(403).send({ error: "Access Denied" });
    throw new Error("Access Denied");
  }
}

export async function AuthMustBeAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
): Promise<void> {
  const info = jwtDecodeCached(req);
  if (info?.role === "admin") {
    return;
  }
  res.status(403).send({ error: "Access Denied" });
  throw new Error("Access Denied");
}

export async function AuthGetUserSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Promise<UserSession> {
  return resolveSession(req);
}
