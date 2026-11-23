// What a pipeline must hold to run at all, and why each rule.

import type { StationBody } from "@re-cinq/floor-contracts";
import type { AgentPrompts } from "./agent-file.js";
import {
  ambiguousEdges,
  danglingEdges,
  deadEnds,
  undeclaredOutcomes,
  unreachableNodes,
  unroutedOutcomes,
} from "./graph-rules.js";
import { supplyOf, unseededNeeds, unsuppliedInputs, type Supply } from "./lint-supply.js";
import {
  problem,
  readPipeline,
  stationOf,
  type Checked,
  type Node,
  type PipelineProblem,
  type PipelineRule,
  type Station,
} from "./lint-shape.js";

export { PIPELINE_RULES } from "./lint-shape.js";
export type { PipelineProblem, PipelineRule };

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
  const supply = supplyOf(checked);
  const { nodes } = checked.line;

  return nodes.flatMap((node, index) => nodeProblems(supply, { node, index }, prompts));
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
  supply: Supply,
  position: { node: Node; index: number },
  prompts: AgentPrompts,
): PipelineProblem[] {
  const { node, index } = position;
  const { checked, line, bodies } = supply;
  const station = stationOf(checked, node);

  if (!station) {
    return [];
  }

  const stationNode = {
    node: line.nodes[index],
    body: bodies.get(node.station ?? "") as StationBody,
  };
  const definition = station.agent_definition ?? node.station ?? "";

  return [
    ...unroutedOutcomes(checked, node, station),
    ...unsuppliedInputs(supply, stationNode, { definition, text: prompts.get(definition) }),
    ...unseededNeeds(supply, stationNode),
  ];
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
