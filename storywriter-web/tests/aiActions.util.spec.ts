import { describe, expect, it } from "vitest";
import { AI_ACTIONS, isAiActionId } from "../utils/aiActions";

describe("aiActions", () => {
  it("exposes the four editor AI actions", () => {
    expect(AI_ACTIONS.map((a) => a.id)).toEqual([
      "continue",
      "summarize",
      "improve",
      "brainstorm",
    ]);
  });

  it("gives every action a label, icon and description", () => {
    for (const action of AI_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.icon).toMatch(/^bi bi-/);
      expect(action.title.length).toBeGreaterThan(0);
    }
  });

  it("keeps ids unique", () => {
    const ids = AI_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validates action ids", () => {
    expect(isAiActionId("continue")).toBe(true);
    expect(isAiActionId("brainstorm")).toBe(true);
    expect(isAiActionId("rewrite-everything")).toBe(false);
  });
});
