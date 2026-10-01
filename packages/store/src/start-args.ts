import { Refusal, enforce } from "./refusal.js";
import type { Item, LineArgSpec } from "./types.js";

/** A refusal that carries every problem, so the caller fixes them in one go. */
export class InvalidStart extends Refusal {
  constructor(readonly problems: string[]) {
    super(`invalid start request: ${problems.join("; ")}`);
  }
}

interface StartGiven {
  lineId: string;
  repo: string | null;
  startItems: Record<string, Item>;
}

export function enforceStartArgs(args: Record<string, LineArgSpec>, given: StartGiven): void {
  enforce(given.repo !== null || !declaresGitArg(args), `line "${given.lineId}" has a git argument, so a start must name its repo`);
  const problems = startArgProblems(args, given.startItems);

  if (problems.length > 0) throw new InvalidStart(problems);
}

function declaresGitArg(args: Record<string, LineArgSpec>): boolean {
  return Object.values(args).some((spec) => spec.kind === "git");
}

/** Every way a start falls short of the line's `args`: a declared arg missing, or present as another kind. A start item the line does not declare is not a problem. */
export function startArgProblems(args: Record<string, LineArgSpec>, startItems: Record<string, Item>): string[] {
  return Object.entries(args).flatMap(([name, spec]) => problemsOfArg(name, spec, startItems));
}

function problemsOfArg(name: string, spec: LineArgSpec, startItems: Record<string, Item>): string[] {
  const given = (startItems as Partial<Record<string, Item>>)[name];

  if (!given) return [`startItems.${name}: required by the line, as kind "${spec.kind}"`];
  if (given.kind !== spec.kind) return [`startItems.${name}: the line wants kind "${spec.kind}", got "${given.kind}"`];

  return [];
}
