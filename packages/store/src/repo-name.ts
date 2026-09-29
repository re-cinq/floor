// One spelling for a repository's name. GitHub, and every host like it, reads `re-cinq/Otto` and `re-cinq/otto` as one repository; the floor keeps the lowered one, so a run is found by whoever names its repository, however they spell it.
import type { Item } from "./types.js";

export interface GitRef {
  repo: string;
  /** Absent for a ref that names a repository and no branch. */
  branch?: string;
}

export function canonicalRepo(repo: string): string {
  return repo.toLowerCase();
}

/** A git item's ref is "host/owner/name@branch". It is cut at the first `@`: a repository's name holds none, and a branch's may. */
export function gitRefOf(ref: string): GitRef {
  const cut = ref.indexOf("@");

  return cut < 0 ? { repo: canonicalRepo(ref) } : { repo: canonicalRepo(ref.slice(0, cut)), branch: ref.slice(cut + 1) };
}

/** The branch is kept as it was written: a branch's name is read with regard to case. */
export function canonicalItems(startItems: Record<string, Item>): Record<string, Item> {
  return Object.fromEntries(Object.entries(startItems).map(([name, given]) => [name, given.kind === "git" ? { ...given, ref: canonicalRef(given.ref) } : given]));
}

function canonicalRef(ref: string): string {
  const { repo, branch } = gitRefOf(ref);

  return branch === undefined ? repo : `${repo}@${branch}`;
}

/** What a definition says of one repository, however the definition spells it. */
export function forRepo<Said>(byRepo: Record<string, Said> | undefined, repo: string): Said | undefined {
  const found = Object.entries(byRepo ?? {}).find(([named]) => canonicalRepo(named) === canonicalRepo(repo));

  return found?.[1];
}
