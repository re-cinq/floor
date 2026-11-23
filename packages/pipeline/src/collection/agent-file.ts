// One agent file: `<name>.md`, its frontmatter the agent's settings, its body its prompt.
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { enforce } from "./enforce.js";

const perMillion = z.number();

const price = z.strictObject({
  input_per_million: perMillion.describe("US dollars for a million input tokens."),
  output_per_million: perMillion.describe("US dollars for a million output tokens."),
  cache_read_per_million: perMillion.describe("US dollars for a million tokens read from the cache. The input price when not stated.").optional(),
  cache_write_per_million: perMillion.describe("US dollars for a million tokens written to the cache. The input price when not stated.").optional(),
});

/** Strict, unlike the stored config: a misspelled key in a file is a bug to fail on, not a field to carry. What `config` may hold is the floor's to say, when the agent is put. */
export const agentFrontmatterSchema = z.strictObject({
  model: z.string().describe("The model the agent runs on.").optional(),
  image: z.string().describe("The container image the agent runs in. Required in a file that defines an agent.").optional(),
  timeout_minutes: z.number().int().positive().describe("How long a visit may run, in minutes. Required in a file that defines an agent.").optional(),
  tags: z.array(z.string()).describe("Which cluster agents may run it. A cluster agent claims a visit only when it offers every tag.").optional(),
  prices: z.record(z.string(), price).describe("Model name to what it costs, for a model that reports tokens and no cost.").optional(),
  config: z.record(z.string(), z.unknown()).describe("Settings for the agent's pod. A key the floor does not know is kept and not acted on.").optional(),
});

type Frontmatter = z.infer<typeof agentFrontmatterSchema>;

export interface ParsedAgentFile {
  name: string;
  frontmatter: Frontmatter;
  /** As written, host keys included: the validated copy reorders config's keys, and the floor is handed the file's order. */
  written: Record<string, unknown>;
  prompt: string | null;
}

/** The settings block of an agent definition, as a pipeline file holds it. */
export type AgentFileSettings = Pick<Frontmatter, "model" | "image" | "timeout_minutes" | "tags" | "prices" | "config"> & { prompt: string | null };

/** The agents a host ships, by name, their settings as the files write them. */
export type ShippedAgents = ReadonlyMap<string, AgentFileSettings>;

/** The prompt of each agent a pipeline can name. */
export type AgentPrompts = ReadonlyMap<string, string | null>;

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

/** A key in `hostKeys` is the host's own: accepted with any value, kept in `written`, and never in the settings. */
export function readAgentFile(name: string, text: string, hostKeys: readonly string[] = []): ParsedAgentFile {
  const match = FRONTMATTER.exec(text);

  enforce(match, `${name}.md: missing the --- frontmatter block`);
  const written = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
  const body = text.slice(match[0].length);

  return { name, frontmatter: validated(name, written, hostKeys), written, prompt: body === "" ? null : body };
}

function validated(name: string, written: Record<string, unknown>, hostKeys: readonly string[]): Frontmatter {
  const own = Object.fromEntries(Object.entries(written).filter(([key]) => !hostKeys.includes(key)));
  const parsed = agentFrontmatterSchema.safeParse(own);

  enforce(parsed.success, `${name}.md: ${parsed.success ? "" : z.prettifyError(parsed.error)}`);

  return parsed.data;
}

const SETTINGS_KEYS = new Set(["model", "image", "timeout_minutes", "tags", "prices", "config"]);

/** The keys a pipeline file's `settings` held, in the file's order. A key the file leaves out stays out. */
export function floorSettingsOf(file: ParsedAgentFile): AgentFileSettings {
  return { ...Object.fromEntries(Object.entries(file.written).filter(([key]) => SETTINGS_KEYS.has(key))), prompt: file.prompt };
}
