// What fills a prompt's `{placeholders}`: each value need under its own name, and `{<name>_path}` for everything that has a place in the workspace, so a prompt never has to know where the workspace is. Beneath those, the visit's own three, `{run_id}`, `{line_id}` and `{node_id}`: a value need of the same name wins.
import { posix } from "node:path";
import type { BriefNeed, NeedSpec, ProduceSpec, StationBody, VisitBrief } from "@re-cinq/floor-contracts";

/** Where the subsystem clones, downloads and watches. With no repo cloned the agent's own working directory is `/`, which is why a bare relative path in a prompt lands in the wrong place. */
export const WORKSPACE = "/workspace";

const PATH_SUFFIX = "_path";

const RUN_PARAMETERS = { run_id: "runId", line_id: "lineId", node_id: "nodeId" } as const;

export const RUN_PARAMETER_NAMES: readonly string[] = Object.keys(RUN_PARAMETERS);

/** Given to a visit that has a git need, and to none other: the subsystem lifts them into the clone's credential helper. */
export const GIT_CREDENTIAL_PARAMETER = "git_credential";
export const GIT_CREDENTIAL_URL_PARAMETER = "git_credential_url";
export const BROKER_PARAMETER_NAMES: readonly string[] = [GIT_CREDENTIAL_PARAMETER, GIT_CREDENTIAL_URL_PARAMETER];

export function runParameters(run: Pick<VisitBrief, "runId" | "lineId" | "nodeId">): Record<string, string> {
  return Object.fromEntries(Object.entries(RUN_PARAMETERS).map(([name, field]) => [name, run[field]]));
}

export function promptParameters(needs: readonly BriefNeed[], produces: readonly ProduceSpec[]): Record<string, string> {
  const placed = [...needs, ...produces].flatMap((entry) => placeOf(entry));
  const values = needs.flatMap((need) => (need.kind === "value" ? [[need.name, need.value] as const] : []));

  return Object.fromEntries([...placed, ...values]);
}

/** Where a non-value need lands in the workspace: the path it declares, or its own name. */
export function needPathOf(need: Pick<NeedSpec, "name" | "path">): string {
  return need.path ?? need.name;
}

export interface DeclaredParameter {
  name: string;
  from: "value-need" | "need-path" | "produce-path";
  /** The need or produce that gives it. */
  source: string;
}

/** The parameters a station's declaration gives its prompt, named by the rules `promptParameters` applies to a brief. Paths first and values last, so the last of a name is the one that wins. */
export function declaredParameters(station: Pick<StationBody, "needs" | "produces">): DeclaredParameter[] {
  const { needs, produces } = station;
  const needPaths = needs.filter(isPlaced).flatMap((need) => placed(need.name, needPathOf(need), "need-path"));
  const producePaths = produces.flatMap((produce) => placed(produce.name, produce.path, "produce-path"));
  const values = needs.filter((need) => !isPlaced(need)).map((need): DeclaredParameter => ({ name: need.name, from: "value-need", source: need.name }));

  return [...needPaths, ...producePaths, ...values];
}

function isPlaced(need: NeedSpec): boolean {
  return need.kind !== "value";
}

function placed(source: string, path: string | undefined, from: "need-path" | "produce-path"): DeclaredParameter[] {
  const place = placementOf(source, path);

  return place ? [{ name: place.parameter, from, source }] : [];
}

// A value need wins over a path of the same name: it is what the station declared.
function placeOf(entry: BriefNeed | ProduceSpec): (readonly [string, string])[] {
  const place = placementOf(entry.name, "path" in entry ? entry.path : undefined);

  return place ? [[place.parameter, place.absolute]] : [];
}

function placementOf(name: string, path: string | undefined): { parameter: string; absolute: string } | null {
  if (path === undefined) return null;
  const absolute = posix.join(WORKSPACE, path);
  const inside = absolute === WORKSPACE || absolute.startsWith(`${WORKSPACE}/`);

  return inside ? { parameter: `${name}${PATH_SUFFIX}`, absolute } : null;
}
