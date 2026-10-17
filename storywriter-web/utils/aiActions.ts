// Definitions for the in-editor AI actions (story-bible/Codex pattern):
// explicit user-invoked actions that use the book's attributes as context.
// Pure data — no API or DOM access — so it stays unit-testable.

export type AiActionId = "continue" | "summarize" | "improve" | "brainstorm";

export interface AiAction {
  id: AiActionId;
  label: string;
  icon: string;
  title: string;
}

export const AI_ACTIONS: AiAction[] = [
  {
    id: "continue",
    label: "Continue",
    icon: "bi bi-pencil-square",
    title: "Continue the text from where it ends",
  },
  {
    id: "summarize",
    label: "Summarize",
    icon: "bi bi-text-left",
    title: "Summarize the section content",
  },
  {
    id: "improve",
    label: "Improve",
    icon: "bi bi-magic",
    title: "Rewrite the selection (or the whole content) for clarity and flow",
  },
  {
    id: "brainstorm",
    label: "Brainstorm",
    icon: "bi bi-lightbulb",
    title: "Propose ideas using the book's attributes as context",
  },
];

export function isAiActionId(value: string): value is AiActionId {
  return AI_ACTIONS.some((action) => action.id === value);
}
