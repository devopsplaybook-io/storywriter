jest.mock("../analysis/LlmClient", () => {
  const actual = jest.requireActual("../analysis/LlmClient");
  return {
    ...actual,
    LlmIsAvailable: jest.fn(() => true),
    callLLMWithRetry: jest.fn(),
  };
});

import { TestServer, TestUser } from "./TestServer";

const { callLLMWithRetry } = jest.requireMock("../analysis/LlmClient");
const callLLMWithRetryMock = callLLMWithRetry as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitForLlmCall(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (callLLMWithRetryMock.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The LLM was never called");
}

describe("Section analysis concurrency", () => {
  let server: TestServer;
  let user: TestUser;
  let bookId: string;
  let rootId: string;
  let sectionId: string;

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    const admin = await server.createUser("admin");
    user = await server.createUser("analysis-user", "user", admin.token);
    const book = await server.createBook(user.token, "Analysis Book");
    bookId = book.id;
    rootId = (await server.getRootSection(user.token, bookId)).id;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    callLLMWithRetryMock.mockReset();
    const res = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: rootId,
      title: "Scene",
      type: "text",
      content: "Original text",
    });
    expect(res.statusCode).toBe(201);
    sectionId = JSON.parse(res.body).id;
  });

  it("keeps content edited while notes generate and only writes the notes", async () => {
    const llm = deferred<string>();
    callLLMWithRetryMock.mockReturnValue(llm.promise);

    const analysisRequest = server.inject(
      "POST",
      `/api/sections/${sectionId}/analysis`,
      user.token,
    );
    await waitForLlmCall();

    const edit = await server.inject(
      "PUT",
      `/api/sections/${sectionId}`,
      user.token,
      { content: "Edited while notes generate", revision: 1 },
    );
    expect(edit.statusCode).toBe(200);
    expect(JSON.parse(edit.body).revision).toBe(2);

    llm.resolve("Generated notes for the scene");
    const analysis = await analysisRequest;
    expect(analysis.statusCode).toBe(200);
    const saved = JSON.parse(analysis.body);
    expect(saved.content).toBe("Edited while notes generate");
    expect(saved.analysis).toBe("Generated notes for the scene");
    // One revision bump from the content edit, one from the targeted notes save.
    expect(saved.revision).toBe(3);

    const rows = await server.query(
      "SELECT content, analysis, revision FROM sections WHERE id = ?",
      [sectionId],
    );
    expect(rows[0]).toEqual({
      content: "Edited while notes generate",
      analysis: "Generated notes for the scene",
      revision: 3,
    });
  });

  it("returns both versions instead of overwriting notes edited during generation", async () => {
    await server.exec("UPDATE sections SET analysis = ? WHERE id = ?", [
      "Manual notes before generation",
      sectionId,
    ]);

    const llm = deferred<string>();
    callLLMWithRetryMock.mockReturnValue(llm.promise);

    const analysisRequest = server.inject(
      "POST",
      `/api/sections/${sectionId}/analysis`,
      user.token,
    );
    await waitForLlmCall();

    const edit = await server.inject(
      "PUT",
      `/api/sections/${sectionId}`,
      user.token,
      { analysis: "Manual notes written during generation", revision: 1 },
    );
    expect(edit.statusCode).toBe(200);
    expect(JSON.parse(edit.body).revision).toBe(2);

    llm.resolve("Generated notes");
    const analysis = await analysisRequest;
    expect(analysis.statusCode).toBe(409);
    expect(JSON.parse(analysis.body)).toEqual({
      error: "AI notes changed while generating",
      analysis: "Generated notes",
      currentAnalysis: "Manual notes written during generation",
      revision: 2,
    });

    const rows = await server.query(
      "SELECT analysis, revision FROM sections WHERE id = ?",
      [sectionId],
    );
    expect(rows[0]).toEqual({
      analysis: "Manual notes written during generation",
      revision: 2,
    });
  });
});
