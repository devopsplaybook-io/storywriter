import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import api from "../utils/api";
import {
  createAppLoginCodeService,
  LoginCodeIsAvailable,
  LOGIN_CODE_BASE_URL,
} from "../utils/loginCodes";

interface RecordedRequest {
  method: string;
  baseURL?: string;
  url?: string;
  authorization: string | null;
  data: unknown;
}

interface MockResponse {
  status: number;
  data: unknown;
}

let requests: RecordedRequest[] = [];
let originalAdapter: AxiosAdapter | undefined;

function headerString(
  headers: InternalAxiosRequestConfig["headers"],
  name: string,
): string | null {
  const value = headers.get(name);
  return value == null ? null : String(value);
}

function installAdapter(
  handler: (config: InternalAxiosRequestConfig) => MockResponse,
): void {
  const adapter: AxiosAdapter = async (config) => {
    requests.push({
      method: (config.method ?? "").toLowerCase(),
      baseURL: config.baseURL,
      url: config.url,
      authorization: headerString(config.headers, "Authorization"),
      data: config.data,
    });
    const { status, data } = handler(config);
    const response: AxiosResponse = {
      data,
      status,
      statusText: "",
      headers: {},
      config,
    };
    if (status >= 400) {
      throw Object.assign(new Error(`Request failed with status ${status}`), {
        isAxiosError: true,
        config,
        response,
      });
    }
    return response;
  };
  api.defaults.adapter = adapter;
}

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    available: true,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 2000,
    approveRequiresPassword: false,
    serverTime: iso(),
    ...overrides,
  };
}

describe("login-code service wiring", () => {
  beforeEach(() => {
    localStorage.clear();
    requests = [];
    originalAdapter = api.defaults.adapter as AxiosAdapter | undefined;
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
  });

  it("calls capabilities below /api without double-prefixing the route", async () => {
    installAdapter(() => ({ status: 200, data: capabilities() }));

    const service = createAppLoginCodeService();
    const result = await service.capabilities();

    expect(result.enabled).toBe(true);
    expect(LOGIN_CODE_BASE_URL).toBe("/users/login-codes");
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("get");
    expect(requests[0].baseURL).toBe("/api");
    expect(requests[0].url).toBe("/users/login-codes/capabilities");
  });

  it("supplies the approver bearer token on preview and approve", async () => {
    localStorage.setItem("token", "jwt");
    installAdapter((config) => {
      if (config.url?.endsWith("/preview")) {
        return {
          status: 200,
          data: {
            deviceLabel: "Firefox on Linux",
            userAgent: "Mozilla/5.0 (test)",
            createdAt: iso(-1000),
            expiresAt: iso(300000),
            userName: "ada",
            serverTime: iso(),
          },
        };
      }
      return {
        status: 200,
        data: { approved: true, expiresAt: iso(300000), serverTime: iso() },
      };
    });

    const service = createAppLoginCodeService();
    await service.preview("BCDFGHJK");
    await service.approve({ code: "BCDFGHJK" });

    expect(requests.map((r) => r.url)).toEqual([
      "/users/login-codes/preview",
      "/users/login-codes/approve",
    ]);
    for (const request of requests) {
      expect(request.authorization).toBe("Bearer jwt");
    }
  });

  it("persists an approved poll exactly once through onSession", async () => {
    const onSession = vi.fn(async () => undefined);
    installAdapter(() => ({
      status: 200,
      data: {
        status: "approved",
        token: "session-token",
        user: { id: "u1", name: "ada" },
        expiresAt: iso(300000),
        serverTime: iso(),
      },
    }));

    const service = createAppLoginCodeService(onSession);
    const result = await service.poll("request-token");

    expect(result.status).toBe("approved");
    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession).toHaveBeenCalledWith("session-token", {
      id: "u1",
      name: "ada",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/users/login-codes/poll");
    const sent =
      typeof requests[0].data === "string"
        ? JSON.parse(requests[0].data)
        : requests[0].data;
    expect(sent).toEqual({ requestToken: "request-token" });
  });

  it("treats disabled or unreachable capabilities as unavailable", async () => {
    installAdapter(() => ({ status: 200, data: capabilities() }));
    await expect(
      LoginCodeIsAvailable(createAppLoginCodeService()),
    ).resolves.toBe(true);

    installAdapter(() => ({
      status: 200,
      data: capabilities({ enabled: false, available: false }),
    }));
    await expect(
      LoginCodeIsAvailable(createAppLoginCodeService()),
    ).resolves.toBe(false);

    installAdapter(() => ({ status: 404, data: { error: "Not Found" } }));
    await expect(
      LoginCodeIsAvailable(createAppLoginCodeService()),
    ).resolves.toBe(false);
  });
});
