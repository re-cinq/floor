// What the latest layout added, moved and dropped over the one before it, kept until the layout changes again.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElkLayout } from "./elk-layout";
import type { VisibleGraph } from "./graph-view-model";
import { diffLayouts, offsetsOf, type NodeOffset } from "./metro/layout-diff";
import { removedStationsOf, type Drawn, type RemovedStation } from "./metro/removed-stations";

export interface LayoutChanges {
  added: ReadonlySet<string>;
  moved: ReadonlySet<string>;
  offsets: ReadonlyMap<string, NodeOffset>;
  removed: readonly RemovedStation[];
}

/** How long a removed station fades; the same 300 ms as `changeFade` in run-graph.module.css. */
const FADE_MS = 300;

const NOTHING_CHANGED: LayoutChanges = { added: new Set(), moved: new Set(), offsets: new Map(), removed: [] };

export function useLayoutChanges(layout: ElkLayout | null, graph: VisibleGraph): LayoutChanges {
  const previous = useRef<Drawn | null>(null);
  const changes = useMemo(() => (layout ? changesOf(previous.current, layout) : NOTHING_CHANGED), [layout]);
  const [clearedChanges, setClearedChanges] = useState<LayoutChanges | null>(null);
  const [fadedLayout, setFadedLayout] = useState<ElkLayout | null>(null);

  useEffect(() => {
    if (layout) previous.current = { layout, graph };
    const timer = setTimeout(() => setFadedLayout(layout), FADE_MS);

    return () => clearTimeout(timer);
  }, [layout]);

  useEffect(() => afterNextPaint(() => setClearedChanges(changes)), [changes]);

  return {
    ...changes,
    offsets: clearedChanges === changes ? NOTHING_CHANGED.offsets : changes.offsets,
    removed: fadedLayout === layout ? NOTHING_CHANGED.removed : changes.removed,
  };
}

function changesOf(before: Drawn | null, layout: ElkLayout): LayoutChanges {
  const { added, moved } = diffLayouts(before?.layout ?? null, layout);

  return {
    added: new Set(added),
    moved: new Set(moved),
    offsets: offsetsOf(before?.layout ?? null, layout),
    removed: before ? removedStationsOf(before, layout) : [],
  };
}

function afterNextPaint(callback: () => void): () => void {
  let inner = 0;
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(callback);
  });

  return () => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
  };
}
