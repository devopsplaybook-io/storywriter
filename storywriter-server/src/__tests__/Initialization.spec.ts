import { TestServer } from "./TestServer";

describe("Initialization status", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
  });

  afterAll(async () => {
    await server.close();
  });

  it("reports an uninitialized database on a fresh install", async () => {
    const res = await server.inject("GET", "/api/users/status/initialization");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ initialized: false });
  });

  it("reports an initialized database after the first user is created", async () => {
    await server.createUser("bootstrap-admin");
    const res = await server.inject("GET", "/api/users/status/initialization");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ initialized: true });
  });
});
