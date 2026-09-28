// The floor names a model; this agent owns the secret for it (docs/assembly_run_storage.md). The key is both the name in `agent-secrets` and the environment variable the agent reads.
const KEY_BY_FAMILY: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  gpt: "OPENAI_API_KEY",
};

export type KeyByFamily = Record<string, string>;

/** `overrides` is what this cluster actually holds, where it differs: a subscription token in place of an API key, say. */
export function modelSecretKeyFor(model: string | undefined, overrides: KeyByFamily = {}): string | undefined {
  const keys = Object.entries({ ...KEY_BY_FAMILY, ...overrides });
  const family = keys.find(([prefix]) => model?.startsWith(prefix));

  return family?.[1];
}

/** Reads `claude=CLAUDE_CODE_OAUTH_TOKEN,gemini=GEMINI_API_KEY`; an entry with no family or no key is skipped. */
export function parseKeyByFamily(listed: string | undefined): KeyByFamily {
  const pairs = (listed ?? "").split(",").map((entry) => entry.split("=").map((part) => part.trim()));
  const named = pairs.filter((pair): pair is [string, string] => pair.length === 2 && pair.every(Boolean));

  return Object.fromEntries(named);
}
