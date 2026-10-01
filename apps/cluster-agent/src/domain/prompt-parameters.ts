// What fills a prompt's `{placeholders}`: each value need under its own name, and `{<name>_path}` for everything that has a place in the workspace, so a prompt never has to know where the workspace is. The run's own two, `{run_id}` and `{line_id}`, are added where the triple is built, beneath these: a value need of the same name wins.
import { posix } from "node:path";
import type { DispatchNeed, DispatchProduce } from "./agent-triple.js";

/** Where the subsystem clones, downloads and watches. With no repo cloned the agent's own working directory is `/`, which is why a bare relative path in a prompt lands in the wrong place. */
export const WORKSPACE = "/workspace";

const PATH_SUFFIX = "_path";

export function promptParameters(needs: readonly DispatchNeed[], produces: readonly DispatchProduce[]): Record<string, string> {
  const placed = [...needs, ...produces].flatMap((entry) => placeOf(entry));
  const values = needs.flatMap((need) => (need.kind === "value" ? [[need.name, need.value] as const] : []));

  return Object.fromEntries([...placed, ...values]);
}

// A value need wins over a path of the same name: it is what the station declared.
function placeOf(entry: DispatchNeed | DispatchProduce): (readonly [string, string])[] {
  if (!("path" in entry) || entry.path === undefined) return [];
  const absolute = posix.join(WORKSPACE, entry.path);
  const inside = absolute === WORKSPACE || absolute.startsWith(`${WORKSPACE}/`);

  return inside ? [[`${entry.name}${PATH_SUFFIX}`, absolute]] : [];
}
