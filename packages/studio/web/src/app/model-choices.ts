// The models the studio offers per agent the floor runs; any other is typed as a custom value.
export const MODEL_GROUPS: { agent: string; models: string[] }[] = [
  { agent: "Claude", models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"] },
  { agent: "Codex", models: ["gpt-5", "o3", "o4-mini"] },
  { agent: "Gemini", models: ["gemini-4-argon", "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"] },
  { agent: "Exec", models: ["exec"] },
];

export const CUSTOM = "Custom…";

export function isKnownModel(model: string): boolean {
  return MODEL_GROUPS.some(({ models }) => models.includes(model));
}
