// Pure: every `{name}` a prompt reads, what supplies it, and whether it is filled on every path into the node — answered from the same naming rules `promptParameters` applies, so a tool and the cluster agent cannot disagree.
import { EXEMPT_NEEDS, coverageContextOf, needCoverage, type NeedContext, type NeedCoverage } from "./line-needs.js";
import { placeholderPattern } from "./placeholder-pattern.js";
import { BROKER_PARAMETER_NAMES, RUN_PARAMETER_NAMES, declaredParameters, type DeclaredParameter } from "./prompt-parameters.js";
import type { LineBody, LineNode, StationBody } from "@re-cinq/floor-contracts";

const PATH_SUFFIX = "_path";

export type PlaceholderSource = "value-need" | "need-path" | "produce-path" | "floor" | "none";

export type PlaceholderState = "unsupplied" | "filled" | NeedCoverage["kind"];

export interface PlaceholderRow {
  name: string;
  source: PlaceholderSource;
  state: PlaceholderState;
  /** The nodes that produce it, for `filled` and `sometimes-empty`. */
  filledBy: string[];
  /** For `sometimes-empty`: one walk of node ids, from a start point to this node, that passes none of `filledBy`. */
  path: string[];
}

export interface PromptPlaceholders {
  placeholders: PlaceholderRow[];
  /** Needs the prompt never mentions, as `{name}` or `{name_path}`, leaving out those the floor fills. */
  unused: string[];
}

export interface PromptPlaceholderInput {
  prompt: string;
  line: LineBody;
  node: LineNode;
  station: StationBody;
  bodies: ReadonlyMap<string, StationBody>;
}

/** Each distinct name in `{name}` form, in order of first appearance. */
export function placeholderNames(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(placeholderPattern("g"))].map(([, name]) => name))];
}

export function promptPlaceholders(input: PromptPlaceholderInput): PromptPlaceholders {
  const names = placeholderNames(input.prompt);
  const context = coverageContextOf(input.line, input.bodies);
  const parameters = declaredParameters(input.station);

  return {
    placeholders: names.map((name) => rowOf(name, input, { parameters, context })),
    unused: unusedNeeds(input, new Set(names)),
  };
}

interface Supply {
  parameters: DeclaredParameter[];
  context: NeedContext;
}

function rowOf(name: string, input: PromptPlaceholderInput, supply: Supply): PlaceholderRow {
  const given = supply.parameters.findLast((parameter) => parameter.name === name);

  if (given) return givenRow(name, given, input, supply.context);
  const byFloor = floorNamesOf(input.station).includes(name);

  return { name, source: byFloor ? "floor" : "none", state: byFloor ? "filled" : "unsupplied", filledBy: [], path: [] };
}

function givenRow(name: string, given: DeclaredParameter, input: PromptPlaceholderInput, context: NeedContext): PlaceholderRow {
  const { station, node } = input;
  const need = station.needs.find((candidate) => given.from !== "produce-path" && candidate.name === given.source);
  const coverage: NeedCoverage = need ? needCoverage(node, need, context) : { kind: "filled", producedBy: [] };

  return {
    name,
    source: given.from,
    state: coverage.kind,
    filledBy: "producedBy" in coverage ? coverage.producedBy : [],
    path: "pathWithout" in coverage ? coverage.pathWithout : [],
  };
}

// The visit's broker parameters go only to a visit that has a git need.
function floorNamesOf(station: StationBody): string[] {
  const hasGitNeed = station.needs.some((need) => need.kind === "git");

  return [...RUN_PARAMETER_NAMES, ...EXEMPT_NEEDS, ...(hasGitNeed ? BROKER_PARAMETER_NAMES : [])];
}

function unusedNeeds({ station, node }: PromptPlaceholderInput, mentioned: ReadonlySet<string>): string[] {
  const unmentioned = station.needs.filter((need) => !mentioned.has(need.name) && !mentioned.has(`${need.name}${PATH_SUFFIX}`));

  return unmentioned.filter((need) => !EXEMPT_NEEDS.includes(node.bind?.[need.name] ?? need.name)).map((need) => need.name);
}
