// One lore node, as the station and agent definition this floor runs in its place.
import type { AgentDefinitionBody, NeedSpec, StationBody } from "@floor/store";
import type { LoreNode, LoreRecipe } from "./lore.js";

export interface ConvertOptions {
  /** The image an agent runs in; lore's recipes leave it to the cluster. */
  image: string;
  /** Replaces every node's model: for a cluster that holds one family's key. */
  model?: string;
  skills?: string[];
  skillsSource?: string;
  mcpServers?: unknown[];
}

export interface Named<Body> {
  id: string;
  body: Body;
}

const HUMAN_TYPES = ["feature_review", "pr_review", "ci_check"];
const THREE_OUTCOMES = ["success", "changes_requested", "failed"];
const DEFAULT_TIMEOUT_MINUTES = 30;
const PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/g;
// Filled by the floor or the cluster agent, never by the line.
const BUILT_IN = ["previous_error", "previous_failures", "context"];

/** Where lore's prompts expect the repo: `/workspace/target`. */
const TARGET: NeedSpec = { name: "target", kind: "git", path: "target" };

export function isHuman(node: LoreNode): boolean {
  return HUMAN_TYPES.includes(node.type);
}

export function stationIdOf(node: LoreNode): string {
  return node.station_ref ?? node.prompt_ref ?? node.job_ref ?? node.type;
}

// One per distinct (prompt, model): the same prompt under another model is another definition.
export function agentDefinitionIdOf(node: LoreNode, recipe: LoreRecipe, options: ConvertOptions): string {
  const model = modelOf(node, recipe, options);
  const asWritten = recipe.settings.model ?? node.model;

  return model && model !== asWritten ? `${recipe.name}--${model.replaceAll(/[^a-z0-9]+/g, "-")}` : recipe.name;
}

function modelOf(node: LoreNode, recipe: LoreRecipe, options: ConvertOptions): string | undefined {
  return options.model ?? node.model ?? recipe.settings.model;
}

export function agentDefinitionOf(node: LoreNode, recipe: LoreRecipe, options: ConvertOptions): AgentDefinitionBody {
  return {
    settings: {
      model: modelOf(node, recipe, options),
      prompt: recipe.prompt,
      image: options.image,
      timeoutMinutes: node.timeout_minutes ?? recipe.settings.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES,
      tags: node.required_tags,
      config: withoutUnset(configOf(recipe, options)),
    },
  };
}

// lore's own names, which the floor reads as they are.
function configOf(recipe: LoreRecipe, options: ConvertOptions): Record<string, unknown> {
  const policy = recipe.settings.test_policy;

  return {
    disallowed_tools: recipe.settings.disallowed_tools,
    env: policy ? { LORE_TEST_POLICY: policy } : undefined,
    skills: options.skills,
    skills_source: options.skillsSource,
    mcp_servers: options.mcpServers,
  };
}

function withoutUnset(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([, given]) => given !== undefined));
}

export function agentStationOf(node: LoreNode, recipe: LoreRecipe, agentDefinition: string): StationBody {
  const access = recipe.settings.repo_workdir === false ? "read" : "write";

  return {
    kind: "agent",
    agentDefinition,
    ...conversationOf(node),
    outcomes: THREE_OUTCOMES,
    needs: [{ ...TARGET, access }, ...valueNeedsOf(recipe.prompt)],
    produces: [{ name: `${node.id}_output`, kind: "file", from: "output" }],
  };
}

// lore writes the key as `args.plan_id`; here it names a bag item, `plan_id`.
function conversationOf(node: LoreNode): Pick<StationBody, "conversation" | "conversationKey"> {
  const continued = node.continues;

  return continued ? { conversation: "continue", conversationKey: continued.key.replace(/^args\./, "") } : { conversation: "new" };
}

// Every name the prompt asks for is a value the line must give it.
function valueNeedsOf(prompt: string): NeedSpec[] {
  const asked = [...prompt.matchAll(PLACEHOLDER)].map((found) => found[1]);
  const given = [...new Set(asked)].filter((name) => !BUILT_IN.includes(name) && !name.endsWith("_path"));

  return given.map((name) => ({ name, kind: "value" }));
}

/** lore writes `{args.pr_url}`; here a route names a need, `{pr_url}`. */
export function humanStationOf(node: LoreNode): StationBody {
  const route = (node.route ?? "").replaceAll("{args.", "{");
  const asked = [...route.matchAll(PLACEHOLDER)].map((found) => found[1]);
  const needs = [...new Set(asked)].map((name): NeedSpec => ({ name, kind: "value" }));

  return { kind: "human", route, outcomes: THREE_OUTCOMES, needs, produces: [] };
}

/** A job lore ran in its own process. What it reads and writes is in lore's code, not in its line. */
export function serviceStationOf(): StationBody {
  return { kind: "service", outcomes: ["success", "failed"], needs: [{ ...TARGET, optional: true }], produces: [] };
}
