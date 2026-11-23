// Pure graph primitives shared by every line check: outgoing edges by source, and reachability with an optional set of nodes that stop the walk from going any further.
import type { LineBody, LineEdge } from "@re-cinq/floor-contracts";

export function goingOutOf(edges: readonly LineEdge[]): Map<string, string[]> {
  const goingOut = new Map<string, string[]>();

  for (const edge of edges) goingOut.set(edge.from, [...(goingOut.get(edge.from) ?? []), edge.to]);

  return goingOut;
}

export function edgesByFrom(line: LineBody): Map<string, string[]> {
  return goingOutOf(line.edges);
}

/** Every node reached by walking `goingOut` from `sources`. A blocked node is recorded as reached but never expanded past. */
export function reachableAvoiding(goingOut: ReadonlyMap<string, string[]>, sources: string[], blocked: ReadonlySet<string>): Set<string> {
  const reached = new Set(sources);
  const pending = sources.filter((source) => !blocked.has(source));

  while (pending.length > 0) {
    const arrivedAt = goingOut.get(pending.pop()!) ?? [];
    const fresh = arrivedAt.filter((to) => !reached.has(to));

    fresh.forEach((to) => reached.add(to));
    pending.push(...fresh.filter((to) => !blocked.has(to)));
  }

  return reached;
}

// From the entry, and from every node the line starts by a name of its own: a person or an outside system arrives there without an edge, and what it leads to is reached too.
export function reachedFrom(line: LineBody): Set<string> {
  const goingOut = edgesByFrom(line);
  const startedByName = line.nodes.filter((node) => node.start);
  const entered = [line.entry, ...startedByName.map((node) => node.id)];

  return reachableAvoiding(goingOut, entered, new Set());
}

/** One shortest walk of node ids from a source to `target` that goes through no blocked node on the way (the target and the source may themselves be blocked), or null when there is none. */
export function pathAvoiding(goingOut: ReadonlyMap<string, string[]>, sources: string[], blocked: ReadonlySet<string>, target: string): string[] | null {
  const cameFrom = new Map<string, string | null>(sources.map((source) => [source, null]));
  const pending = [...sources];

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    const fresh = blocked.has(current) ? [] : (goingOut.get(current) ?? []).filter((to) => !cameFrom.has(to));

    fresh.forEach((to) => cameFrom.set(to, current));
    pending.push(...fresh);
  }

  return cameFrom.has(target) ? walkBack(cameFrom, target) : null;
}

function walkBack(cameFrom: ReadonlyMap<string, string | null>, target: string): string[] {
  const path = [target];

  for (let before = cameFrom.get(target); before; before = cameFrom.get(before)) path.unshift(before);

  return path;
}
