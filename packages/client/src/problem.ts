// What the floor refused, as something a caller can catch and read. A floor answers RFC 9457, but a proxy in between may answer HTML or nothing, so a problem is synthesised rather than letting a parse failure bury the real one.
import type { Problem } from "@re-cinq/floor-contracts";

const PROBLEM_TYPE = "application/problem+json";

export class FloorProblem extends Error implements Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  /** What a 400 lists when a body failed to parse, one sentence a field. */
  readonly errors?: string[];
  readonly method: string;
  readonly path: string;

  constructor(problem: Problem, asked: { method: string; path: string }) {
    super(`the floor refused ${asked.method} ${asked.path} with ${problem.status}: ${problem.detail ?? problem.title}`);
    this.name = "FloorProblem";
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
    this.detail = problem.detail;
    this.errors = problem.errors;
    this.method = asked.method;
    this.path = asked.path;
  }
}

export function isFloorProblem(error: unknown): error is FloorProblem {
  return error instanceof FloorProblem;
}

export async function problemOf(response: Response): Promise<Problem> {
  const said = await response.text().catch(() => "");

  return statedIn(response, said) ?? { type: "about:blank", title: response.statusText || "the floor refused", status: response.status, detail: said || undefined };
}

function statedIn(response: Response, said: string): Problem | null {
  const contentType = response.headers.get("content-type") ?? "";

  return contentType.startsWith(PROBLEM_TYPE) ? parsed(said) : null;
}

function parsed(said: string): Problem | null {
  try {
    return JSON.parse(said) as Problem;
  } catch {
    return null;
  }
}
