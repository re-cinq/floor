import type { ElkLayout, LaidOutNode } from "../elk-layout";
import type { VisibleGraph, VisibleNode } from "../graph-view-model";
import { diffLayouts } from "./layout-diff";

export interface RemovedStation {
  node: LaidOutNode;
  model: VisibleNode;
}

/** A layout together with the graph it was drawn from. */
export interface Drawn {
  layout: ElkLayout;
  graph: VisibleGraph;
}

/** The stations of `before` that `after` no longer has, with the model each was drawn from. */
export function removedStationsOf({ layout, graph }: Drawn, after: ElkLayout): RemovedStation[] {
  const gone = new Set(diffLayouts(layout, after).removed);
  const models = new Map(graph.nodes.map((model) => [model.id, model]));

  return layout.nodes.flatMap((node) => {
    const model = models.get(node.id);

    return model && gone.has(node.id) ? [{ node, model }] : [];
  });
}
