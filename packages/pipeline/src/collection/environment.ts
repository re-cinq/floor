// Fills `${NAME}` placeholders from an environment: into a pipeline's text and an agent's settings, never into a prompt.
import { enforce } from "./enforce.js";
import type { AgentFileSettings } from "./agent-file.js";

export type Environment = Record<string, string | undefined>;

const PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}/g;

/** The names a text asks for, each once, in the order they first appear. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

export function withEnvironment(yamlText: string, env: Environment): string {
  return yamlText.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = env[name];

    enforce(value, `${name} is not set, and a pipeline names it`);

    return value;
  });
}

export function settingsWithEnvironment(settings: unknown, env: Environment): AgentFileSettings {
  const { prompt, ...rest } = settings as AgentFileSettings;

  return { ...(filledIn(rest, env) as typeof rest), prompt };
}

function filledIn(value: unknown, env: Environment): unknown {
  if (typeof value === "string") return withEnvironment(value, env);
  if (Array.isArray(value)) return value.map((element) => filledIn(element, env));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, filledIn(field, env)]));
}
