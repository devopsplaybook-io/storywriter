import { RateLimitResetForTests } from "../utils/RateLimit";
import { TestServer } from "./TestServer";

describe("password minimum length", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
  });

  afterAll(async () => {
    await server.close();
    RateLimitResetForTests();
  });

  it("rejects bootstrap and admin-created users below the minimum", async () => {
    // Bootstrap: seven characters is too short, eight is accepted
    const shortBootstrap = await server.inject("POST", "/api/users", undefined, {
      name: "policy-admin",
      password: "1234567",
    });
    expect(shortBootstrap.statusCode).toBe(400);
    expect(JSON.parse(shortBootstrap.body).error).toContain(
      "Password Too Short",
    );
    expect(JSON.parse(shortBootstrap.body).error).toContain("8");

    const bootstrap = await server.inject("POST", "/api/users", undefined, {
      name: "policy-admin",
      password: "12345678",
    });
    expect(bootstrap.statusCode).toBe(201);

    const login = await server.inject("POST", "/api/users/session", undefined, {
      name: "policy-admin",
      password: "12345678",
    });
    expect(login.statusCode).toBe(201);
    const adminToken = JSON.parse(login.body).token;

    const shortUser = await server.inject(
      "POST",
      "/api/users",
      adminToken,
      { name: "policy-short", password: "1234567", role: "user" },
    );
    expect(shortUser.statusCode).toBe(400);
    expect(JSON.parse(shortUser.body).error).toContain("Password Too Short");

    const validUser = await server.inject(
      "POST",
      "/api/users",
      adminToken,
      { name: "policy-valid", password: "12345678", role: "user" },
    );
    expect(validUser.statusCode).toBe(201);
  });

  it("enforces the minimum on password changes", async () => {
    const login = await server.inject("POST", "/api/users/session", undefined, {
      name: "policy-valid",
      password: "12345678",
    });
    expect(login.statusCode).toBe(201);
    const token = JSON.parse(login.body).token;

    const tooShort = await server.inject(
      "PUT",
      "/api/users/password",
      token,
      { passwordOld: "12345678", password: "1234567" },
    );
    expect(tooShort.statusCode).toBe(400);
    expect(JSON.parse(tooShort.body).error).toContain("Password Too Short");

    const accepted = await server.inject(
      "PUT",
      "/api/users/password",
      token,
      { passwordOld: "12345678", password: "abcdefgh" },
    );
    expect(accepted.statusCode).toBe(201);

    // The new password is effective
    const relogin = await server.inject(
      "POST",
      "/api/users/session",
      undefined,
      { name: "policy-valid", password: "abcdefgh" },
    );
    expect(relogin.statusCode).toBe(201);
  });
});
