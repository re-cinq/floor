// One line file read on its own, so a line the collection's overlay would refuse for its problems is still a line, with the problems beside it.
import { enforce, validateLine } from "@re-cinq/floor-assembly-lines";
import { pipelineOf, pipelineProblems, readPipelineFile, type AgentPrompts, type CollectionFile } from "@re-cinq/floor-pipeline";
import type { LineBody, StationBody } from "@re-cinq/floor-contracts";
import type { ViewProblem } from "../view.js";

export interface ReadLine {
  id: string;
  file: string;
  body: LineBody;
  bodies: ReadonlyMap<string, StationBody>;
  problems: ViewProblem[];
}

export function readLine(file: CollectionFile, folder: string, prompts: AgentPrompts): ReadLine {
  const pipeline = pipelineOf(readPipelineFile(file.text));

  enforce(pipeline.line, "the file holds no line");
  const body = lineBodyOf(pipeline.line.body, Object.keys(pipeline.files));
  const bodies = new Map(pipeline.stations.map(({ id, body: station }) => [id, stationBodyOf(station)]));
  const problems = [...folderProblems(folder, pipeline.line.id), ...lintProblems(file.text, prompts), ...validationProblems(body, bodies)];

  return { id: pipeline.line.id, file: file.path, body, bodies, problems: withoutRepeats(problems) };
}

// A file may leave out every part of a line but its id: the rules read a line with each part present.
function lineBodyOf(written: Record<string, unknown>, fileNames: string[]): LineBody {
  const files = Object.fromEntries(fileNames.map((name) => [name, ""]));

  return { args: {}, nodes: [], edges: [], files, ...written } as unknown as LineBody;
}

function stationBodyOf(written: Record<string, unknown>): StationBody {
  return { outcomes: [], needs: [], produces: [], ...written } as unknown as StationBody;
}

function folderProblems(folder: string, lineId: string): ViewProblem[] {
  return lineId === folder ? [] : [{ rule: "folder-name", message: `the folder ${folder} must hold the line of that name, and its line is ${lineId}` }];
}

function lintProblems(text: string, prompts: AgentPrompts): ViewProblem[] {
  return pipelineProblems(text, prompts).map(({ rule, node, detail }) => ({ rule, ...(node && { node }), message: detail }));
}

function validationProblems(body: LineBody, bodies: ReadonlyMap<string, StationBody>): ViewProblem[] {
  const messages = validateLine(body, { stations: new Set(bodies.keys()), bodies });

  return messages.map((message) => ({ rule: "line-validation", message }));
}

/** What the line check says in its words that a rule of the lint says in its own: the lint's is kept. */
const SAID_BY_LINT: { says: RegExp; rule: string }[] = [
  { says: /^edge \d+: (from|to) "/, rule: "dangling-edge" },
  { says: /has no outgoing edge$/, rule: "dead-end" },
  { says: /is not reachable from entry/, rule: "unreachable" },
  { says: /has no edge for outcome/, rule: "outcome-without-edge" },
];

function withoutRepeats(problems: ViewProblem[]): ViewProblem[] {
  const lint = problems.filter(({ rule }) => rule !== "line-validation");

  return problems.filter((problem, index) => problems.findIndex((other) => other.message === problem.message) === index && !saidByLint(problem, lint));
}

function saidByLint({ rule, message }: ViewProblem, lint: ViewProblem[]): boolean {
  const subject = /"([^"]*)"/.exec(message)?.[1] ?? "";
  const covering = SAID_BY_LINT.filter(({ says }) => rule === "line-validation" && says.test(message));

  return covering.some(({ rule: lintRule }) => lint.some((other) => other.rule === lintRule && other.message.includes(subject) || other.node === subject));
}
