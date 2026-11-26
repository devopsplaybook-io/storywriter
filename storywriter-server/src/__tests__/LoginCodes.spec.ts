import { RateLimitResetForTests } from "../utils/RateLimit";
import { TestServer } from "./TestServer";

/** The base20 alphabet shipped by common-utils (no vowels, no L/S lookalikes). */
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;

function body(res: { body: string }): any {
  return JSON.parse(res.body);
}

function expectNoStore(res: { headers: Record<string, any> }): void {
  expect(res.headers["cache-control"]).toBe("no-store");
}

describe("login with a code — enabled", () => {
  let server: TestServer;
  let admin: { id: string; name: string; token: string };

  beforeAll(async () => {
    server = new TestServer();
    await server.init({ loginCodeEnabled: true });
    admin = await server.createUser("lc-admin", "admin");
  });

  afterAll(async () => {
    await server.close();
  });

  it("reports the feature enabled and available", async () => {
    const res = await server.inject(
      "GET",
      "/api/users/login-codes/capabilities",
    );
    expect(res.statusCode).toBe(200);
    expectNoStore(res);
    expect(body(res)).toMatchObject({
      enabled: true,
      available: true,
      codeLength: 8,
      approveRequiresPassword: false,
    });
    expect(typeof body(res).pollIntervalMs).toBe("number");
    expect(typeof body(res).serverTime).toBe("string");
  });

  it("runs create → preview → approve → poll and redeems a single-use session", async () => {
    const created = await server.inject(
      "POST",
      "/api/users/login-codes/",
      undefined,
      {},
    );
    expect(created.statusCode).toBe(201);
    expectNoStore(created);
    const { requestToken, code } = body(created);
    expect(typeof requestToken).toBe("string");
    expect(requestToken.length).toBeGreaterThan(20);
    expect(code).toMatch(CODE_RE);

    const preview = await server.inject(
      "POST",
      "/api/users/login-codes/preview",
      admin.token,
      { code },
    );
    expect(preview.statusCode).toBe(200);
    expectNoStore(preview);
    expect(body(preview).userName).toBe("lc-admin");
    expect(typeof body(preview).deviceLabel).toBe("string");

    const approve = await server.inject(
      "POST",
      "/api/users/login-codes/approve",
      admin.token,
      { code },
    );
    expect(approve.statusCode).toBe(200);
    expectNoStore(approve);
    expect(body(approve).approved).toBe(true);

    const poll = await server.inject(
      "POST",
      "/api/users/login-codes/poll",
      undefined,
      { requestToken },
    );
    expect(poll.statusCode).toBe(200);
    expectNoStore(poll);
    const polled = body(poll);
    expect(polled.status).toBe("approved");
    expect(typeof polled.token).toBe("string");
    expect(polled.user).toMatchObject({ name: "lc-admin" });

    // The redeemed token is a working interactive session.
    const tokens = await server.inject(
      "GET",
      "/api/users/tokens",
      polled.token,
    );
    expect(tokens.statusCode).toBe(200);

    // Redemption is single-use.
    const again = await server.inject(
      "POST",
      "/api/users/login-codes/poll",
      undefined,
      { requestToken },
    );
    expect(again.statusCode).toBe(409);
    expectNoStore(again);
    expect(body(again).code).toBe("ALREADY_USED");
  });

  it("rejects an unknown code with INVALID_CODE", async () => {
    const res = await server.inject(
      "POST",
      "/api/users/login-codes/preview",
      admin.token,
      { code: "ZZZZZZZZ" },
    );
    expect(res.statusCode).toBe(400);
    expectNoStore(res);
    expect(body(res).code).toBe("INVALID_CODE");
  });

  it("reports the request as expired after its TTL elapsed", async () => {
    const created = await server.inject(
      "POST",
      "/api/users/login-codes/",
      undefined,
      {},
    );
    expect(created.statusCode).toBe(201);
    const { requestToken } = body(created);

    const rows = await server.query(
      'SELECT "id" FROM users_login_codes WHERE "status" = ? ORDER BY rowid DESC LIMIT 1',
      ["pending"],
    );
    expect(rows).toHaveLength(1);
    const past = new Date(Date.now() - 60_000).toISOString();
    await server.exec(
      'UPDATE users_login_codes SET "expiresAt" = ? WHERE "id" = ?',
      [past, rows[0].id],
    );

    const poll = await server.inject(
      "POST",
      "/api/users/login-codes/poll",
      undefined,
      { requestToken },
    );
    expect(poll.statusCode).toBe(200);
    expectNoStore(poll);
    expect(body(poll).status).toBe("expired");
  });

  it("refuses API tokens as approvers and keeps the code pending", async () => {
    const tokenRes = await server.inject(
      "POST",
      "/api/users/tokens",
      admin.token,
      { name: "ci" },
    );
    expect(tokenRes.statusCode).toBe(201);
    const apiToken = body(tokenRes).token;
    expect(typeof apiToken).toBe("string");

    const created = await server.inject(
      "POST",
      "/api/users/login-codes/",
      undefined,
      {},
    );
    expect(created.statusCode).toBe(201);
    const { code } = body(created);

    const preview = await server.inject(
      "POST",
      "/api/users/login-codes/preview",
      apiToken,
      { code },
    );
    expect(preview.statusCode).toBe(403);
    expectNoStore(preview);
    expect(body(preview).code).toBe("FORBIDDEN");

    const approve = await server.inject(
      "POST",
      "/api/users/login-codes/approve",
      apiToken,
      { code },
    );
    expect(approve.statusCode).toBe(403);
    expect(body(approve).code).toBe("FORBIDDEN");

    // The rejected attempts did not consume the code: an interactive
    // session can still preview and approve it.
    const previewJwt = await server.inject(
      "POST",
      "/api/users/login-codes/preview",
      admin.token,
      { code },
    );
    expect(previewJwt.statusCode).toBe(200);
    const approveJwt = await server.inject(
      "POST",
      "/api/users/login-codes/approve",
      admin.token,
      { code },
    );
    expect(approveJwt.statusCode).toBe(200);
    expect(body(approveJwt).approved).toBe(true);
  });
});

describe("login with a code — disabled", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init({ loginCodeEnabled: false });
  });

  afterAll(async () => {
    await server.close();
  });

  it("does not mount the login-code routes", async () => {
    const capabilities = await server.inject(
      "GET",
      "/api/users/login-codes/capabilities",
    );
    expect(capabilities.statusCode).toBe(404);

    const create = await server.inject(
      "POST",
      "/api/users/login-codes/",
      undefined,
      {},
    );
    expect(create.statusCode).toBe(404);
  });

  it("keeps password login working", async () => {
    const user = await server.createUser("lc-disabled-admin", "admin");
    expect(user.token).toBeTruthy();
    const login = await server.inject(
      "POST",
      "/api/users/session",
      undefined,
      { name: user.name, password: "password" },
    );
    expect(login.statusCode).toBe(201);
  });
});

describe("login throttle isolation with login codes", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init({ loginCodeEnabled: true });
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  beforeEach(() => {
    RateLimitResetForTests();
  });

  it("throttles failed password logins but never login-code polling", async () => {
    const admin = await server.createUser("lc-throttle-admin", "admin");
    await server.createUser("lc-throttle-user", "user", admin.token);

    server.config.RATE_LIMIT_LOGIN_MAX = 3;
    try {
      // The login throttle counts only failed POST …/session attempts.
      for (let i = 0; i < 3; i++) {
        const res = await server.inject(
          "POST",
          "/api/users/session",
          undefined,
          { name: "lc-throttle-user", password: "wrong" },
        );
        expect(res.statusCode).toBe(401);
      }
      const blocked = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "lc-throttle-user", password: "wrong" },
      );
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();

      // Login-code create and 2 s-style polling are not throttled by it.
      const created = await server.inject(
        "POST",
        "/api/users/login-codes/",
        undefined,
        {},
      );
      expect(created.statusCode).toBe(201);
      const { requestToken } = body(created);
      for (let i = 0; i < 3; i++) {
        const poll = await server.inject(
          "POST",
          "/api/users/login-codes/poll",
          undefined,
          { requestToken },
        );
        expect(poll.statusCode).toBe(200);
      }

      // The throttle key is IP + username: another user still signs in.
      const success = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: admin.name, password: "password" },
      );
      expect(success.statusCode).toBe(201);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });
});
