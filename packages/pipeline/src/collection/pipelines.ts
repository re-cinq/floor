// The pipelines a collection sets, each checked against the agents it can name.
import type { AgentPrompts } from "./agent-file.js";
import type { CollectionOverlayInput, OverlayAgent } from "./agents.js";
import { withEnvironment } from "./environment.js";
import { enforce } from "./enforce.js";
import { pipelineProblems, type PipelineProblem } from "./lint-rules.js";
import { lineLayoutOf, type LineFile } from "./line-layout.js";
import { attempt } from "./refusal.js";
import { unknownKeys } from "./unknown-keys.js";
import { readPipelineFile } from "../file.js";
import { pipelineOf, type Pipeline } from "../shape.js";

/** The pipelines the collection sets, its own and its versions of the lines the host ships. Each names its agents only: the agents are put on their own, so a pipeline is imported with no agent definitions of its own. */
export function pipelinesOverlay(input: CollectionOverlayInput, collectionAgents: ReadonlyMap<string, OverlayAgent>) {
  const layout = lineLayoutOf(input.files);
  const results = layout.read.map((file) => attempt(file.path, () => pipelineOfFile(file, input, collectionAgents)));
  const pipelines = results.flatMap((result) => ("made" in result ? [result.made] : []));
  const unread = results.flatMap((result) => ("refusal" in result ? [result.refusal] : []));

  return { pipelines, refused: [...layout.refused, ...unread] };
}

function pipelineOfFile(file: LineFile, { shipped, env }: CollectionOverlayInput, collectionAgents: ReadonlyMap<string, OverlayAgent>): Pipeline {
  const filled = withEnvironment(file.text, env);

  enforceNoProblems(pipelineProblems(filled, promptsOf(shipped.agents, collectionAgents)));
  const pipeline = pipelineOf(readPipelineFile(filled));

  enforceNoProblems(unknownKeys(pipeline));

  enforce(pipeline.line?.id === file.folder, `the folder ${file.folder} must hold the pipeline of that name, and its line is ${pipeline.line?.id}`);

  return pipeline;
}

function enforceNoProblems(problems: PipelineProblem[]): void {
  enforce(problems.length === 0, problems.map((problem) => problem.detail).join("; "));
}

/** The prompts a pipeline can name: the shipped agents' and the collection's own. */
function promptsOf(shipped: CollectionOverlayInput["shipped"]["agents"], collectionAgents: ReadonlyMap<string, OverlayAgent>): AgentPrompts {
  return new Map([...[...shipped].map(([name, agent]) => [name, agent.prompt] as const), ...[...collectionAgents].map(([name, agent]) => [name, agent.settings.prompt] as const)]);
}
