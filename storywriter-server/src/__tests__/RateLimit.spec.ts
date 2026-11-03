import { Config } from "../Config";
import {
  ConcurrencyAcquire,
  ConcurrencyActive,
  ConcurrencyRelease,
  RateLimitCheck,
  RateLimitPeek,
  RateLimitRecordFailure,
  RateLimitResetForTests,
} from "../utils/RateLimit";
import {
  ImportExportAcquire,
  ImportExportRelease,
  LlmLimitMessage,
  LlmRequestAcquire,
  LlmRequestRelease,
} from "../utils/RequestLimits";
import { TestServer } from "./TestServer";

describe("RateLimitCheck — fixed window", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-24T00:00:00.000Z"));
    RateLimitResetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows up to max calls within the window", () => {
    for (let i = 0; i < 3; i++) {
      expect(RateLimitCheck("k", 3, 60_000).allowed).toBe(true);
    }
  });

  it("blocks beyond max with a retry-after of at least one second", () => {
    RateLimitCheck("k", 2, 60_000);
    RateLimitCheck("k", 2, 60_000);
    const blocked = RateLimitCheck("k", 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window once windowMs has elapsed", () => {
    expect(RateLimitCheck("k", 1, 5_000).allowed).toBe(true);
    expect(RateLimitCheck("k", 1, 5_000).allowed).toBe(false);
    jest.setSystemTime(new Date("2026-10-24T00:00:05.000Z"));
    expect(RateLimitCheck("k", 1, 5_000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(RateLimitCheck("a", 1, 60_000).allowed).toBe(true);
    expect(RateLimitCheck("a", 1, 60_000).allowed).toBe(false);
    expect(RateLimitCheck("b", 1, 60_000).allowed).toBe(true);
  });
});

describe("RateLimitPeek / RateLimitRecordFailure — failure-only window", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-24T00:00:00.000Z"));
    RateLimitResetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("peek never creates or consumes an entry", () => {
    expect(RateLimitPeek("k", 1, 60_000).allowed).toBe(true);
    expect(RateLimitPeek("k", 1, 60_000).allowed).toBe(true);
    RateLimitRecordFailure("k", 60_000);
    expect(RateLimitPeek("k", 1, 60_000).allowed).toBe(false);
  });

  it("records failures up to max and reports a retry-after", () => {
    RateLimitRecordFailure("k", 60_000);
    RateLimitRecordFailure("k", 60_000);
    expect(RateLimitPeek("k", 3, 60_000).allowed).toBe(true);
    RateLimitRecordFailure("k", 60_000);
    const blocked = RateLimitPeek("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a fresh failure window after windowMs", () => {
    RateLimitRecordFailure("k", 5_000);
    expect(RateLimitPeek("k", 1, 5_000).allowed).toBe(false);
    jest.setSystemTime(new Date("2026-10-24T00:00:05.000Z"));
    expect(RateLimitPeek("k", 1, 5_000).allowed).toBe(true);
    RateLimitRecordFailure("k", 5_000);
    expect(RateLimitPeek("k", 1, 5_000).allowed).toBe(false);
  });
});

describe("ConcurrencyAcquire — counting semaphore", () => {
  beforeEach(() => {
    RateLimitResetForTests();
  });

  it("admits up to max holders and refuses beyond", () => {
    expect(ConcurrencyAcquire("k", 2)).toBe(true);
    expect(ConcurrencyAcquire("k", 2)).toBe(true);
    expect(ConcurrencyAcquire("k", 2)).toBe(false);
    expect(ConcurrencyActive("k")).toBe(2);
  });

  it("frees the slot on release", () => {
    ConcurrencyAcquire("k", 1);
    ConcurrencyRelease("k");
    expect(ConcurrencyActive("k")).toBe(0);
    expect(ConcurrencyAcquire("k", 1)).toBe(true);
  });
});

describe("LlmRequestAcquire — concurrency and daily quota", () => {
  beforeEach(() => {
    RateLimitResetForTests();
  });

  const config = {
    LLM_USER_CONCURRENCY: 1,
    LLM_DAILY_QUOTA: 2,
  } as Config;

  it("rejects a second concurrent request for the same user", () => {
    expect(LlmRequestAcquire("u1", config)).toBe("ok");
    expect(LlmRequestAcquire("u1", config)).toBe("concurrency");
    expect(LlmRequestAcquire("u2", config)).toBe("ok");
  });

  it("blocks the user once the daily quota is exhausted", () => {
    expect(LlmRequestAcquire("u1", config)).toBe("ok");
    LlmRequestRelease("u1");
    expect(LlmRequestAcquire("u1", config)).toBe("ok");
    LlmRequestRelease("u1");
    // Third request of the day: concurrency is fine, quota is not
    expect(LlmRequestAcquire("u1", config)).toBe("quota");
    expect(ConcurrencyActive("llm:u1")).toBe(0);
  });

  it("maps limit kinds to user-facing messages", () => {
    expect(LlmLimitMessage("concurrency")).toBe(
      "Another AI request is already running",
    );
    expect(LlmLimitMessage("quota")).toBe("Daily AI request quota exceeded");
  });
});

describe("Rate-limited routes", () => {
  let server: TestServer;
  let admin: { id: string; token: string };

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("rl-admin", "admin");
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  beforeEach(() => {
    RateLimitResetForTests();
  });

  it("throttles failed login attempts per IP + username with a Retry-After header", async () => {
    expect(admin.token).toBeTruthy();

    server.config.RATE_LIMIT_LOGIN_MAX = 3;
    try {
      for (let i = 0; i < 3; i++) {
        const res = await server.inject(
          "POST",
          "/api/users/session",
          undefined,
          { name: "nobody", password: "wrong" },
        );
        expect(res.statusCode).toBe(401);
      }
      const blocked = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "nobody", password: "wrong" },
      );
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
      expect(JSON.parse(blocked.body).error).toBe(
        "Too many login attempts, try again later",
      );

      // Non-login routes are never throttled
      const books = await server.inject("POST", "/api/books", admin.token, {
        name: "Still allowed",
      });
      expect(books.statusCode).toBe(201);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });

  it("does not let one user's failures block another user", async () => {
    const bob = await server.createUser("rl-bob", "user", admin.token);
    server.config.RATE_LIMIT_LOGIN_MAX = 2;
    try {
      for (let i = 0; i < 2; i++) {
        const res = await server.inject(
          "POST",
          "/api/users/session",
          undefined,
          { name: "rl-alice", password: "wrong" },
        );
        expect(res.statusCode).toBe(401);
      }
      // Alice's failures exhaust only her own budget
      const aliceBlocked = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-alice", password: "wrong" },
      );
      expect(aliceBlocked.statusCode).toBe(429);

      // Bob can still log in from the same (proxy) address
      const bobLogin = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: bob.name, password: "password" },
      );
      expect(bobLogin.statusCode).toBe(201);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });

  it("does not consume the failure budget on successful logins", async () => {
    const carol = await server.createUser("rl-carol", "user", admin.token);
    server.config.RATE_LIMIT_LOGIN_MAX = 2;
    try {
      const fail = async () =>
        server.inject("POST", "/api/users/session", undefined, {
          name: carol.name,
          password: "wrong",
        });
      expect((await fail()).statusCode).toBe(401);
      const success = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: carol.name, password: "password" },
      );
      expect(success.statusCode).toBe(201);
      // Only the two failures count: one more failure is the second
      expect((await fail()).statusCode).toBe(401);
      expect((await fail()).statusCode).toBe(429);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });

  it("ignores X-Forwarded-For when the proxy is not trusted", async () => {
    server.config.RATE_LIMIT_LOGIN_MAX = 1;
    try {
      const first = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-dave", password: "wrong" },
        { "x-forwarded-for": "203.0.113.10" },
      );
      expect(first.statusCode).toBe(401);
      // A different forwarded address shares the socket-IP budget
      const second = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-dave", password: "wrong" },
        { "x-forwarded-for": "203.0.113.11" },
      );
      expect(second.statusCode).toBe(429);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });

  it("limits concurrent imports/exports per user", async () => {
    const user = await server.createUser("rl-exporter", "user", admin.token);
    const book = await server.createBook(user.token, "Limited exports");
    server.config.IMPORT_EXPORT_CONCURRENCY = 1;

    try {
      // Hold the only import/export slot, then the route must refuse
      expect(ImportExportAcquire(user.id, server.config)).toBe(true);
      const blocked = await server.inject(
        "GET",
        `/api/books/${book.id}/export`,
        user.token,
      );
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body).error).toBe(
        "Too many import/export operations, try again shortly",
      );

      ImportExportRelease(user.id);
      const ok = await server.inject(
        "GET",
        `/api/books/${book.id}/export`,
        user.token,
      );
      expect(ok.statusCode).toBe(200);
      expect(ok.headers["content-type"]).toContain("application/gzip");
    } finally {
      server.config.IMPORT_EXPORT_CONCURRENCY = 2;
      RateLimitResetForTests();
    }
  });

  /** The AI analysis routes only accept text sections (the root is a container). */
  async function createTextSection(
    token: string,
    bookId: string,
  ): Promise<{ id: string }> {
    const root = await server.getRootSection(token, bookId);
    const res = await server.inject("POST", "/api/sections", token, {
      bookId,
      parentId: root.id,
      type: "text",
      title: "Chapter",
      content: "Some content.",
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  it("rejects a second AI request while one is running for the user", async () => {
    const user = await server.createUser("rl-ai-user", "user", admin.token);
    const book = await server.createBook(user.token, "AI throttled");
    const section = await createTextSection(user.token, book.id);

    server.config.LLM_API_KEY = "test-key";
    server.config.LLM_USER_CONCURRENCY = 1;
    server.config.LLM_DAILY_QUOTA = 10;
    try {
      expect(LlmRequestAcquire(user.id, server.config)).toBe("ok");
      const blocked = await server.inject(
        "POST",
        `/api/sections/${section.id}/analysis`,
        user.token,
      );
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body).error).toBe(
        "Another AI request is already running",
      );
    } finally {
      LlmRequestRelease(user.id);
      RateLimitResetForTests();
    }
  });

  it("rejects AI requests once the daily quota is exhausted", async () => {
    const user = await server.createUser("rl-quota-user", "user", admin.token);
    const book = await server.createBook(user.token, "AI quota");
    const section = await createTextSection(user.token, book.id);

    server.config.LLM_API_KEY = "test-key";
    server.config.LLM_DAILY_QUOTA = 1;
    try {
      // Burn the whole daily quota
      expect(LlmRequestAcquire(user.id, server.config)).toBe("ok");
      LlmRequestRelease(user.id);

      const blocked = await server.inject(
        "POST",
        `/api/sections/${section.id}/analysis`,
        user.token,
      );
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body).error).toBe(
        "Daily AI request quota exceeded",
      );
    } finally {
      RateLimitResetForTests();
    }
  });
});

describe("login throttle behind a trusted proxy", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init({ trustProxy: true });
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  beforeEach(() => {
    RateLimitResetForTests();
  });

  it("keys the throttle on the forwarded client IP when trustProxy is enabled", async () => {
    await server.createUser("rl-proxy-admin", "admin");
    server.config.RATE_LIMIT_LOGIN_MAX = 1;
    try {
      const first = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-proxy-user", password: "wrong" },
        { "x-forwarded-for": "203.0.113.20" },
      );
      expect(first.statusCode).toBe(401);

      // A different forwarded client has its own budget
      const second = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-proxy-user", password: "wrong" },
        { "x-forwarded-for": "203.0.113.21" },
      );
      expect(second.statusCode).toBe(401);

      // The original client is now blocked
      const third = await server.inject(
        "POST",
        "/api/users/session",
        undefined,
        { name: "rl-proxy-user", password: "wrong" },
        { "x-forwarded-for": "203.0.113.20" },
      );
      expect(third.statusCode).toBe(429);
    } finally {
      server.config.RATE_LIMIT_LOGIN_MAX = 1000;
      RateLimitResetForTests();
    }
  });
});

describe("DAY_MS window for the LLM quota", () => {
  it("quota windows span a full day", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-24T00:00:00.000Z"));
    RateLimitResetForTests();
    try {
      const config = { LLM_USER_CONCURRENCY: 1, LLM_DAILY_QUOTA: 1 } as Config;
      expect(LlmRequestAcquire("u-day", config)).toBe("ok");
      LlmRequestRelease("u-day");
      expect(LlmRequestAcquire("u-day", config)).toBe("quota");
      // A day later the quota resets
      jest.setSystemTime(new Date("2026-10-25T00:00:00.000Z"));
      expect(LlmRequestAcquire("u-day", config)).toBe("ok");
    } finally {
      jest.useRealTimers();
      RateLimitResetForTests();
    }
  });
});
