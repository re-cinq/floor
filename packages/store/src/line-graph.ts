// Pure graph primitives shared by every line check: outgoing edges by source, and reachability with an optional set of nodes that stop the walk from going any further.
import type { LineBody } from "./types.js";

export function edgesByFrom(line: LineBody): Map<string, string[]> {
  const goingOut = new Map<string, string[]>();

  for (const edge of line.edges) goingOut.set(edge.from, [...(goingOut.get(edge.from) ?? []), edge.to]);

  return goingOut;
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
