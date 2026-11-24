// The agents a collection sets: a full definition replaces or adds one, an extension appends to a shipped agent's prompt.
import { floorSettingsOf, readAgentFile, type AgentFileSettings, type ShippedAgents } from "./agent-file.js";
import { settingsWithEnvironment, type Environment } from "./environment.js";
import { enforce } from "./enforce.js";
import { agentFileOf, type CollectionFile } from "./paths.js";
import { attempt, type Refusal } from "./refusal.js";

export interface ShippedCatalog {
  /** The names of the pipelines the host ships. */
  pipelines: readonly string[];
  /** The shipped agents, their settings as the md files write them (environment not yet filled in). */
  agents: ShippedAgents;
}

export interface CollectionOverlayInput {
  files: readonly CollectionFile[];
  shipped: ShippedCatalog;
  env: Environment;
  /** Frontmatter keys that are the host's own: accepted in an agent file, and never in its settings. */
  hostKeys?: readonly string[];
  /** Group folder names, in order: a name held in several of them is read from the one listed last. */
  groups?: readonly string[];
}

export type AgentSource = "collection-new" | "replaced" | "extended";

export interface OverlayAgent {
  settings: AgentFileSettings;
  source: AgentSource;
}

interface AgentEntry extends CollectionFile {
  agent: string;
  isExtension: boolean;
}

const REQUIRED_SETTINGS = ["image", "timeout_minutes", "prompt"] as const;

/** The agents the collection sets, the first file to name an agent winning. */
export function agentsOverlay(input: CollectionOverlayInput) {
  const agents = new Map<string, OverlayAgent>();
  const setBy = new Map<string, string>();
  const refused: Refusal[] = [];

  for (const file of agentFilesOf(input.files)) {
    const result = attempt(file.path, () => agentOf(file, input, setBy));

    if ("refusal" in result) {
      refused.push(result.refusal);
      continue;
    }

    agents.set(file.agent, result.made);
    setBy.set(file.agent, file.path);
  }

  return { agents, refused };
}

/** A shipped agent's prompt with the collection's extension appended. */
export function extendedPrompt(base: string, extra: string): string {
  return `${base}\n\n${extra}`;
}

function agentFilesOf(files: readonly CollectionFile[]): AgentEntry[] {
  const agentFiles = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .flatMap((file) => {
      const named = agentFileOf(file.path);

      return named ? [{ ...file, ...named }] : [];
    });

  // A full definition goes first, so an extension of the same agent is the one refused.
  return [...agentFiles.filter((file) => !file.isExtension), ...agentFiles.filter((file) => file.isExtension)];
}

function agentOf(file: AgentEntry, { shipped, env, hostKeys }: CollectionOverlayInput, setBy: ReadonlyMap<string, string>): OverlayAgent {
  const base = shipped.agents.get(file.agent);

  enforce(!setBy.has(file.agent), `${file.agent} is already set by ${setBy.get(file.agent)}`);

  return file.isExtension ? extendedAgent(file, base, env) : definedAgent(file, base, env, hostKeys);
}

function extendedAgent(file: AgentEntry, base: AgentFileSettings | undefined, env: Environment): OverlayAgent {
  enforce(base, `an extension needs a shipped agent, and nothing ships ${file.agent}`);

  return { source: "extended", settings: settingsWithEnvironment({ ...base, prompt: extendedPrompt(base.prompt ?? "", file.text) }, env) };
}

function definedAgent(file: AgentEntry, base: AgentFileSettings | undefined, env: Environment, hostKeys: readonly string[] | undefined): OverlayAgent {
  const settings = floorSettingsOf(readAgentFile(file.agent, file.text, hostKeys));

  for (const field of REQUIRED_SETTINGS) {
    enforce(settings[field], `${file.agent} has no ${field}, and a full agent definition needs a prompt, an image and timeout_minutes`);
  }

  return { source: base ? "replaced" : "collection-new", settings: settingsWithEnvironment(settings, env) };
}
