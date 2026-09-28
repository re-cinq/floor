// The floor names a model; this agent owns the secret for it (docs/assembly_run_storage.md). The key is both the name in `agent-secrets` and the environment variable the agent reads.
const KEY_BY_FAMILY: [prefix: string, key: string][] = [
  ["claude", "ANTHROPIC_API_KEY"],
  ["gemini", "GEMINI_API_KEY"],
  ["gpt", "OPENAI_API_KEY"],
];

export function modelSecretKeyFor(model: string | undefined): string | undefined {
  const family = KEY_BY_FAMILY.find(([prefix]) => model?.startsWith(prefix));

  return family?.[1];
}
