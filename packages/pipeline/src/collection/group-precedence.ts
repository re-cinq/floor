import { agentFileGroupOf, agentFileOf, lineFilePlaceOf, type CollectionFile } from "./paths.js";

interface Claim {
  file: CollectionFile;
  name: string;
  group: string | undefined;
}

/** The collection's files, less each line file and agent file that sits in a listed group when a later listed group holds the same line or agent; the folder of a line is no group. */
export function withoutReplacedFiles(files: readonly CollectionFile[], groups: readonly string[]): CollectionFile[] {
  const lineFolders = new Set(files.flatMap((file) => lineFilePlaceOf(file.path)?.folderPath ?? []));
  const claims = files.flatMap((file) => claimOf(file, lineFolders));
  const kept = new Set(withoutEarlierGroups(claims, groups).map((claim) => claim.file));
  const claimed = new Set(claims.map((claim) => claim.file));

  return files.filter((file) => kept.has(file) || !claimed.has(file));
}

function claimOf(file: CollectionFile, lineFolders: ReadonlySet<string>): Claim[] {
  const line = lineFilePlaceOf(file.path);
  const agent = agentFileOf(file.path);
  const claim = line ? { name: `line ${line.folder}`, group: line.group } : agent && { name: `agent ${agent.agent}`, group: agentFileGroupOf(file.path) };

  return claim ? [{ file, name: claim.name, group: claim.group && !lineFolders.has(claim.group) ? claim.group : undefined }] : [];
}

function withoutEarlierGroups(claims: readonly Claim[], groups: readonly string[]): Claim[] {
  const rankOf = (group: string | undefined) => (group === undefined ? -1 : groups.indexOf(group));

  return claims.filter((claim) => rankOf(claim.group) < 0 || !claims.some((other) => other.name === claim.name && rankOf(other.group) > rankOf(claim.group)));
}
