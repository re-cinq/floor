// The pipelines a collection sets, each checked against the agents it can name.
import type { AgentPrompts } from "./agent-file.js";
import type { CollectionOverlayInput, OverlayAgent } from "./agents.js";
import { withEnvironment } from "./environment.js";
import { enforce } from "./enforce.js";
import { pipelineProblems } from "./lint-rules.js";
import { FORMER_LINE_FILE, LINE_FILE, pipelineFolderOf, type CollectionFile } from "./paths.js";
import { attempt, type Refusal } from "./refusal.js";
import { readPipelineFile } from "../file.js";
import { pipelineOf, type Pipeline } from "../shape.js";

interface PipelineEntry extends CollectionFile {
  folder: string;
}

/** The pipelines the collection sets, its own and its versions of the lines the host ships. Each names its agents only: the agents are put on their own, so a pipeline is imported with no agent definitions of its own. */
export function pipelinesOverlay(input: CollectionOverlayInput, collectionAgents: ReadonlyMap<string, OverlayAgent>) {
  const pipelines: Pipeline[] = [];
  const refused: Refusal[] = [];

  const lineFiles = pipelineFilesOf(input.files);
  const superseded = supersededBy(lineFiles);

  for (const file of lineFiles) {
    const result = attempt(file.path, () => {
      enforce(!superseded.has(file.path), `the folder ${file.folder} holds its line twice: ${LINE_FILE} is read, so remove ${FORMER_LINE_FILE}`);

      return pipelineOfFile(file, input, collectionAgents);
    });

    if ("refusal" in result) {
      refused.push(result.refusal);
      continue;
    }

    pipelines.push(result.made);
  }

  return { pipelines, refused };
}

// The former name's file, in a folder that holds the line under its name too: two files would be two versions of one line.
function supersededBy(lineFiles: readonly PipelineEntry[]): Set<string> {
  const named = new Set(lineFiles.filter((file) => file.path.endsWith(`/${LINE_FILE}`)).map((file) => file.folder));
  const former = lineFiles.filter((file) => file.path.endsWith(`/${FORMER_LINE_FILE}`) && named.has(file.folder));

  return new Set(former.map((file) => file.path));
}

function pipelineFilesOf(files: readonly CollectionFile[]): PipelineEntry[] {
  return files
    .flatMap((file) => {
      const folder = pipelineFolderOf(file.path);

      return folder ? [{ ...file, folder }] : [];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function pipelineOfFile(file: PipelineEntry, { shipped, env }: CollectionOverlayInput, collectionAgents: ReadonlyMap<string, OverlayAgent>): Pipeline {
  const filled = withEnvironment(file.text, env);

  enforceNoProblems(filled, promptsOf(shipped.agents, collectionAgents));
  const pipeline = pipelineOf(readPipelineFile(filled));

  enforce(pipeline.line?.id === file.folder, `the folder ${file.folder} must hold the pipeline of that name, and its line is ${pipeline.line?.id}`);

  return pipeline;
}

function enforceNoProblems(yamlText: string, prompts: AgentPrompts): void {
  const problems = pipelineProblems(yamlText, prompts);

  enforce(problems.length === 0, problems.map((problem) => problem.detail).join("; "));
}

/** The prompts a pipeline can name: the shipped agents' and the collection's own. */
function promptsOf(shipped: CollectionOverlayInput["shipped"]["agents"], collectionAgents: ReadonlyMap<string, OverlayAgent>): AgentPrompts {
  return new Map([...[...shipped].map(([name, agent]) => [name, agent.prompt] as const), ...[...collectionAgents].map(([name, agent]) => [name, agent.settings.prompt] as const)]);
}
