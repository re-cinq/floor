// The keys the latest layout added over the one before it, kept until the layout changes again.
import { useEffect, useMemo, useRef } from "react";
import type { ElkLayout } from "./elk-layout";
import { diffLayouts } from "./metro/layout-diff";

const NOTHING_ADDED: ReadonlySet<string> = new Set();

export function useLayoutChanges(layout: ElkLayout | null): ReadonlySet<string> {
  const previous = useRef<ElkLayout | null>(null);
  const added = useMemo(() => (layout ? new Set(diffLayouts(previous.current, layout).added) : NOTHING_ADDED), [layout]);

  useEffect(() => {
    if (layout) previous.current = layout;
  }, [layout]);

  return added;
}
