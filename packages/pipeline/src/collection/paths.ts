// The layout of a collection: `<line>/assembly-line.yaml`, `<line>/agents/<agent>.md` and `<line>/agents/<agent>.extra.md`, where a line folder may sit inside a group folder. A line folder written before the file was renamed holds `pipeline.yaml`, which is read as the same thing.
/** The host's own top folders: the skills it serves its agents, not lines. */
const HOST_FOLDERS = ["skills", "agent-skills"];

/** A line or group folder: any name but a host folder or one starting with a dot. */
const FOLDER = String.raw`(?!\.)(?!(?:${HOST_FOLDERS.join("|")})\/)[^/]+`;

/** A folder that holds lines. One directly above `agents/` is a line folder, never a group. */
function optionalGroup(group: string): string {
  return String.raw`(?:${group}\/(?!agents\/))?`;
}

const OPTIONAL_GROUP = optionalGroup(FOLDER);
const PIPELINE_FILE = new RegExp(String.raw`^(${optionalGroup(`(${FOLDER})`)}(${FOLDER}))\/(assembly-line|pipeline)\.yaml$`);

/** The name a line's file has. */
export const LINE_FILE = "assembly-line.yaml";

/** The name it had, still read. */
export const FORMER_LINE_FILE = "pipeline.yaml";
const AGENT_FILE = new RegExp(String.raw`^${OPTIONAL_GROUP}${FOLDER}\/agents\/([^/]+?)(\.extra)?\.md$`);

/** A file of a collection: its path from the collection's root, and its text. */
export interface CollectionFile {
  path: string;
  text: string;
}

/** Where a line's file sits: its line folder's name, that folder's path, and the group folder above it, undefined for a top-level line folder. */
export interface LineFilePlace {
  folder: string;
  folderPath: string;
  group: string | undefined;
}

export function lineFilePlaceOf(path: string): LineFilePlace | undefined {
  const match = PIPELINE_FILE.exec(path);

  return match ? { folderPath: match[1], group: match[2], folder: match[3] } : undefined;
}

/** The name of the line folder a line's file sits in. */
export function pipelineFolderOf(path: string): string | undefined {
  return lineFilePlaceOf(path)?.folder;
}

/** The line folder a line's file sits in, with its group folder if it has one. */
export function lineFolderPathOf(path: string): string | undefined {
  return lineFilePlaceOf(path)?.folderPath;
}

export function agentFileOf(path: string): { agent: string; isExtension: boolean } | undefined {
  const match = AGENT_FILE.exec(path);

  return match ? { agent: match[1], isExtension: Boolean(match[2]) } : undefined;
}

/** A markdown or YAML file inside a line folder: read, or refused as a path a collection does not read. A file at the top, under `docs/`, under a host folder or under a dot folder is not the collection's. */
const LINE_FOLDER_FILE = new RegExp(String.raw`^(?!(?:docs|${HOST_FOLDERS.join("|")})\/)[^./][^/]*\/.+\.(md|ya?ml)$`);

export function isCollectionFile(path: string): boolean {
  return LINE_FOLDER_FILE.test(path);
}

/** A path a collection reads: a pipeline or an agent file. */
export function isReadPath(path: string): boolean {
  return pipelineFolderOf(path) !== undefined || agentFileOf(path) !== undefined;
}
