import { useEffect, useMemo, useRef } from "react";
import type { LineView, NodeView } from "@protocol";
import { graphOf } from "@/graph/graph-of";
import { RunGraphView } from "@re-cinq/floor-graph";
import Inspector, { type InspectorActions } from "./Inspector";
import LineHeader from "./LineHeader";
import ProblemsList from "./ProblemsList";
import { useCoveredBelow } from "./use-covered-below";
import styles from "./line.module.css";

export interface LineScreenProps {
  line: LineView;
  node: NodeView | undefined;
  inspector?: InspectorActions;
  onSelectNode: (nodeId: string | undefined) => void;
}

export default function LineScreen({ line, node, inspector, onSelectNode }: LineScreenProps) {
  const definition = useMemo(() => graphOf(line), [line]);
  const screenRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const coveredBelow = useCoveredBelow(screenRef, graphRef, node);

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onSelectNode(undefined);

    window.addEventListener("keydown", clearOnEscape);

    return () => window.removeEventListener("keydown", clearOnEscape);
  }, [onSelectNode]);

  return (
    <div ref={screenRef} className={styles.screen} data-inspecting={node ? "" : undefined}>
      <div className={styles.primary}>
        <LineHeader line={line} />
        <div ref={graphRef} className={styles.graph}>
          <RunGraphView definition={definition} selectedNodeId={node?.id} coveredBelow={coveredBelow} onSelectNode={onSelectNode} />
        </div>
        <ProblemsList problems={line.problems} onSelectNode={onSelectNode} />
      </div>
      {node && <Inspector node={node} actions={inspector} onClose={() => onSelectNode(undefined)} />}
    </div>
  );
}
