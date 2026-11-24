// The keys the latest layout added or moved over the one before it, kept until the layout changes again.
import { useEffect, useMemo, useRef } from "react";
import type { ElkLayout } from "./elk-layout";
import { diffLayouts } from "./metro/layout-diff";

export interface LayoutChanges {
  added: ReadonlySet<string>;
  moved: ReadonlySet<string>;
}

const NOTHING_CHANGED: LayoutChanges = { added: new Set(), moved: new Set() };

export function useLayoutChanges(layout: ElkLayout | null): LayoutChanges {
  const previous = useRef<ElkLayout | null>(null);
  const changes = useMemo(() => {
    if (!layout) return NOTHING_CHANGED;
    const { added, moved } = diffLayouts(previous.current, layout);

    return { added: new Set(added), moved: new Set(moved) };
  }, [layout]);

  useEffect(() => {
    if (layout) previous.current = layout;
  }, [layout]);

  return changes;
}
