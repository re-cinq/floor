// What a pipeline must hold to run at all, and why each rule.

import type { AgentPrompts } from "./agent-file.js";
import {
  ambiguousEdges,
  danglingEdges,
  deadEnds,
  undeclaredOutcomes,
  unreachableNodes,
  unroutedOutcomes,
} from "./graph-rules.js";
import {
  problem,
  readPipeline,
  stationOf,
  type BagItem,
  type Checked,
  type Node,
  type PipelineProblem,
  type PipelineRule,
  type Station,
} from "./lint-shape.js";

export type { PipelineProblem, PipelineRule };

// The floor fills these from the run itself, so no line declares them.
const FLOOR_SUPPLIED = new Set(["run_id", "line_id", "node_id", "git_credential", "git_credential_url"]);

// Filled by the floor around a retry or a fan-out branch, never seeded or produced by a line.
const FLOOR_FILLED_NEEDS = new Set([
  "previous_error",
  "previous_failures",
  "item",
]);

const PLACEHOLDER = /\{([a-z_][a-z0-9_.]*)\}/g;

export function pipelineProblems(
  yamlText: string,
  prompts: AgentPrompts,
): PipelineProblem[] {
  const checked = readPipeline(yamlText);

  if (!checked) {
    return [];
  }

  return [
    ...agentDeclarationProblems(checked, prompts),
    ...unkeyedLine(checked),
    ...undeclaredBags(checked),
    ...allNodeProblems(checked, prompts),
    ...graphRuleProblems(checked),
    ...unboundedRetries(checked),
    ...unresolvableConversationKeys(checked),
  ];
}

function graphRuleProblems(checked: Checked): PipelineProblem[] {
  return [
    ...ambiguousEdges(checked),
    ...undeclaredOutcomes(checked),
    ...danglingEdges(checked),
    ...deadEnds(checked),
    ...unreachableNodes(checked),
  ];
}

function allNodeProblems(
  checked: Checked,
  prompts: AgentPrompts,
): PipelineProblem[] {
  const { nodes } = checked.line;

  return nodes.flatMap((node) => nodeProblems(checked, node, prompts));
}

// An agent is declared once, in its .md file: a pipeline file only names it from a station.
function agentDeclarationProblems(
  checked: Checked,
  prompts: AgentPrompts,
): PipelineProblem[] {
  return [
    ...agentSettingsInPipeline(checked),
    ...undeclaredAgents(checked, prompts),
  ];
}

function agentSettingsInPipeline(checked: Checked): PipelineProblem[] {
  return checked.agent_definitions === undefined
    ? []
    : [
        problem(
          checked,
          undefined,
          "agent-settings-in-pipeline",
          "the file carries an agent_definitions block; in a collection an agent's settings live in <line>/agents/<agent>.md",
        ),
      ];
}

function undeclaredAgents(
  checked: Checked,
  prompts: AgentPrompts,
): PipelineProblem[] {
  return Object.entries(checked.stations)
    .map(([name, station]) => ({ name, agent: station.agent_definition }))
    .filter(({ agent }) => agent !== undefined && !prompts.has(agent))
    .map(({ name, agent }) =>
      problem(
        checked,
        undefined,
        "undeclared-agent",
        `station "${name}" names agent definition "${agent}", and nothing defines it: a collection defines an agent in <line>/agents/<agent>.md`,
      ),
    );
}

// The floor refuses a station missing either array with a 400 naming none.
function undeclaredBags(checked: Checked): PipelineProblem[] {
  return Object.entries(checked.stations)
    .map(([name, station]) => ({ name, missing: missingBags(station) }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ name, missing }) =>
      problem(
        checked,
        undefined,
        "undeclared-bag",
        `station "${name}" declares no ${missing.join(" and no ")}; the floor requires both arrays`,
      ),
    );
}

function missingBags(station: Station): string[] {
  return [
    ...(station.needs ? [] : ["needs"]),
    ...(station.produces ? [] : ["produces"]),
  ];
}

// A run keyed on nothing cannot be the one run for its subject, so two starters make two.
function unkeyedLine(checked: Checked): PipelineProblem[] {
  const keys = Object.entries(checked.line.args)
    .filter(([, arg]) => arg.subject === true)
    .map(([name]) => name);

  if (keys.length === 1) {
    return [];
  }

  return [problem(checked, undefined, "unkeyed-line", unkeyedDetail(keys))];
}

function unkeyedDetail(keys: string[]): string {
  return keys.length === 0
    ? "no arg carries subject: true, so the floor cannot refuse a second run for the same subject"
    : `${keys.join(", ")} all carry subject: true, and a run has one subject`;
}

function nodeProblems(
  checked: Checked,
  node: Node,
  prompts: AgentPrompts,
): PipelineProblem[] {
  const station = stationOf(checked, node);

  if (!station) {
    return [];
  }

  return [
    ...unroutedOutcomes(checked, node, station),
    ...unsuppliedInputs(checked, node, station, prompts),
    ...unseededNeeds(checked, node, station),
  ];
}

// The floor's own check (its line-needs.ts). A git need is only ever seeded, by a git arg. Any other need is seeded by an arg or a line file, or produced by a station; the floor further asks that a producer sits on EVERY path into the node, which this does not.
function unseededNeeds(
  checked: Checked,
  node: Node,
  station: Station,
): PipelineProblem[] {
  return (station.needs ?? [])
    .filter((need) => !need.optional && need.collect === undefined)
    .map((need) => ({ need, bagName: bagNameOf(node, need) }))
    .filter(({ bagName }) => !FLOOR_FILLED_NEEDS.has(bagName))
    .filter(({ need, bagName }) => !isSeeded(checked, need, bagName))
    .map(({ need, bagName }) =>
      problem(
        checked,
        node.id,
        "unseeded-need",
        unseededDetail(node, need, bagName),
      ),
    );
}

function bagNameOf(node: Node, need: BagItem): string {
  const name = need.name ?? "";

  return node.bind?.[name] ?? name;
}

function isSeeded(checked: Checked, need: BagItem, bagName: string): boolean {
  const { args, files } = checked.line;

  if (need.kind === "git") {
    return Object.entries(args).some(
      ([name, arg]) => name === bagName && arg.kind === "git",
    );
  }

  return (
    bagName in args ||
    bagName in (files ?? {}) ||
    producedNames(checked).has(bagName)
  );
}

function producedNames(checked: Checked): Set<string> {
  return new Set(
    Object.values(checked.stations).flatMap((station) =>
      namesOf(station.produces ?? []),
    ),
  );
}

function unseededDetail(node: Node, need: BagItem, bagName: string): string {
  const label =
    need.name === bagName
      ? `"${need.name}"`
      : `"${need.name}" (bound as "${bagName}")`;

  return need.kind === "git"
    ? `node "${node.id}" needs ${label} as kind "git", which nothing in the line seeds`
    : `node "${node.id}" needs ${label}, which nothing in the line seeds or produces`;
}

// A recipe reused from another line reads inputs this line may never put in the bag.
function unsuppliedInputs(
  checked: Checked,
  node: Node,
  station: Station,
  prompts: AgentPrompts,
): PipelineProblem[] {
  const definition = station.agent_definition ?? node.station ?? "";
  const missing = missingInputsOf(checked, station, prompts.get(definition));

  return missing.length === 0
    ? []
    : [
        problem(
          checked,
          node.id,
          "unsupplied-input",
          unsuppliedDetail(definition, missing),
        ),
      ];
}

function missingInputsOf(
  checked: Checked,
  station: Station,
  prompt: string | null | undefined,
): string[] {
  return station.kind === "agent" && prompt
    ? unsuppliedPlaceholders(prompt, suppliedNames(checked, station))
    : [];
}

function unsuppliedDetail(definition: string, missing: string[]): string {
  return `the ${definition} recipe reads ${missing.join(", ")}, which neither this line's args nor the node's needs supply`;
}

function unsuppliedPlaceholders(
  prompt: string,
  supplied: Set<string>,
): string[] {
  const named = new Set(
    [...prompt.matchAll(PLACEHOLDER)].map(([, name]) => name as string),
  );

  return (
    [...named]
      .filter((name) => !FLOOR_SUPPLIED.has(name))
      .filter((name) => !supplied.has(name))
      // A file item named `ticket` is read as `{ticket_path}`, where the floor put it.
      .filter((name) => !supplied.has(name.replace(/_path$/, "")))
      .sort()
  );
}

function suppliedNames(checked: Checked, station: Station): Set<string> {
  return new Set([
    ...Object.keys(checked.line.args),
    ...namesOf(station.needs ?? []),
    ...namesOf(station.produces ?? []),
  ]);
}

function namesOf(bagItems: { name?: string }[]): string[] {
  return bagItems
    .map((bagItem) => bagItem.name)
    .filter((name): name is string => typeof name === "string");
}

// A walk revisiting a node needs iteration_max to bound the loop.
function unboundedRetries(checked: Checked): PipelineProblem[] {
  const { edges } = checked.line;
  const backEdges = edges.filter(
    (edge) => edge.from === edge.to && edge.iteration_max === undefined,
  );

  return backEdges.map((edge) =>
    problem(
      checked,
      edge.from,
      "unbounded-retry",
      `node "${edge.from}" has a back-edge to itself with no iteration_max; the walk would retry without bound`,
    ),
  );
}

// conversation_key must name a declared arg so the floor can key the conversation.
function unresolvableConversationKeys(checked: Checked): PipelineProblem[] {
  const argNames = new Set(Object.keys(checked.line.args));

  return Object.entries(checked.stations)
    .filter(
      ([, station]) =>
        station.conversation_key !== undefined &&
        !argNames.has(station.conversation_key),
    )
    .map(([name, station]) =>
      problem(
        checked,
        undefined,
        "unresolvable-conversation-key",
        `station "${name}" sets conversation_key to "${station.conversation_key}", which is not a declared arg`,
      ),
    );
}
