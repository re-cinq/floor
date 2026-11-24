// The pipelines a collection sets, each checked against the agents it can name.
import type { AgentPrompts } from "./agent-file.js";
import type { CollectionOverlayInput, OverlayAgent } from "./agents.js";
import { withEnvironment } from "./environment.js";
import { enforce } from "./enforce.js";
import { pipelineProblems } from "./lint-rules.js";
import { FORMER_LINE_FILE, LINE_FILE, lineFilePlaceOf, type CollectionFile, type LineFilePlace } from "./paths.js";
import { attempt, type Refusal } from "./refusal.js";
import { readPipelineFile } from "../file.js";
import { pipelineOf, type Pipeline } from "../shape.js";

type PipelineEntry = CollectionFile & LineFilePlace;

/** The pipelines the collection sets, its own and its versions of the lines the host ships. Each names its agents only: the agents are put on their own, so a pipeline is imported with no agent definitions of its own. */
export function pipelinesOverlay(input: CollectionOverlayInput, collectionAgents: ReadonlyMap<string, OverlayAgent>) {
  const pipelines: Pipeline[] = [];
  const setBy = new Map<string, string>();
  const refused: Refusal[] = [];

  const lineFiles = pipelineFilesOf(input.files);
  const superseded = supersededBy(lineFiles);
  const lineFolders = new Set(lineFiles.map((file) => file.folderPath));

  for (const file of lineFiles) {
    const result = attempt(file.path, () => {
      enforce(!superseded.has(file.path), `the folder ${file.folder} holds its line twice: ${LINE_FILE} is read, so remove ${FORMER_LINE_FILE}`);

      enforce(file.group === undefined || !lineFolders.has(file.group), `the folder ${file.group} holds a line, so it is not a group: move ${file.folder} out of it`);

      enforce(!setBy.has(file.folder), `${file.folder} is already set by ${setBy.get(file.folder)}`);

      return pipelineOfFile(file, input, collectionAgents);
    });

    if ("refusal" in result) {
      refused.push(result.refusal);
      continue;
    }

    pipelines.push(result.made);
    setBy.set(file.folder, file.path);
  }

  return { pipelines, refused };
}

// The former name's file, in a folder that holds the line under its name too: two files would be two versions of one line.
function supersededBy(lineFiles: readonly PipelineEntry[]): Set<string> {
  const named = new Set(lineFiles.filter((file) => file.path.endsWith(`/${LINE_FILE}`)).map((file) => file.folderPath));
  const former = lineFiles.filter((file) => file.path.endsWith(`/${FORMER_LINE_FILE}`) && named.has(file.folderPath));

  return new Set(former.map((file) => file.path));
}

function pipelineFilesOf(files: readonly CollectionFile[]): PipelineEntry[] {
  return files
    .flatMap((file) => {
      const place = lineFilePlaceOf(file.path);

      return place ? [{ ...file, ...place }] : [];
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
