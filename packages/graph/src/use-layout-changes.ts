// The keys the latest layout added or moved over the one before it, kept until the layout changes again.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElkLayout } from "./elk-layout";
import { diffLayouts, offsetsOf, type NodeOffset } from "./metro/layout-diff";

export interface LayoutChanges {
  added: ReadonlySet<string>;
  moved: ReadonlySet<string>;
  offsets: ReadonlyMap<string, NodeOffset>;
}

const NOTHING_CHANGED: LayoutChanges = { added: new Set(), moved: new Set(), offsets: new Map() };

export function useLayoutChanges(layout: ElkLayout | null): LayoutChanges {
  const previous = useRef<ElkLayout | null>(null);
  const changes = useMemo(() => {
    if (!layout) return NOTHING_CHANGED;
    const { added, moved } = diffLayouts(previous.current, layout);

    return { added: new Set(added), moved: new Set(moved), offsets: offsetsOf(previous.current, layout) };
  }, [layout]);

  const [clearedChanges, setClearedChanges] = useState<LayoutChanges | null>(null);

  useEffect(() => {
    if (layout) previous.current = layout;
  }, [layout]);

  useEffect(() => {
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setClearedChanges(changes));
    });
    let inner = 0;

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [changes]);

  return clearedChanges === changes ? { ...changes, offsets: NOTHING_CHANGED.offsets } : changes;
}
