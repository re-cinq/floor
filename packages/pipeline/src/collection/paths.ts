// The layout of a collection: `<line>/pipeline.yaml`, `<line>/agents/<agent>.md` and `<line>/agents/<agent>.extra.md`.
const PIPELINE_FILE = /^([^/]+)\/pipeline\.yaml$/;
const AGENT_FILE = /^[^/]+\/agents\/([^/]+?)(\.extra)?\.md$/;

/** A file of a collection: its path from the collection's root, and its text. */
export interface CollectionFile {
  path: string;
  text: string;
}

/** The line folder a `pipeline.yaml` sits in. */
export function pipelineFolderOf(path: string): string | undefined {
  return PIPELINE_FILE.exec(path)?.[1];
}

export function agentFileOf(path: string): { agent: string; isExtension: boolean } | undefined {
  const match = AGENT_FILE.exec(path);

  return match ? { agent: match[1], isExtension: Boolean(match[2]) } : undefined;
}

/** A markdown or YAML file inside a line folder: read, or refused as a path a collection does not read. A file at the top, under `docs/` or under a dot folder is not the collection's. */
const LINE_FOLDER_FILE = /^(?!docs\/)[^./][^/]*\/.+\.(md|ya?ml)$/;

export function isCollectionFile(path: string): boolean {
  return LINE_FOLDER_FILE.test(path);
}

/** A path a collection reads: a pipeline or an agent file. */
export function isReadPath(path: string): boolean {
  return pipelineFolderOf(path) !== undefined || agentFileOf(path) !== undefined;
}
