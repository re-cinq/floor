import { useEffect, useMemo } from "react";
import type { LineView, NodeView } from "@protocol";
import { graphOf } from "@/graph/graph-of";
import RunGraphView from "@/graph/RunGraphView";
import Inspector, { type InspectorActions } from "./Inspector";
import LineHeader from "./LineHeader";
import ProblemsList from "./ProblemsList";
import styles from "./line.module.css";

export interface LineScreenProps {
  line: LineView;
  node: NodeView | undefined;
  inspector?: InspectorActions;
  onSelectNode: (nodeId: string | undefined) => void;
}

export default function LineScreen({ line, node, inspector, onSelectNode }: LineScreenProps) {
  const definition = useMemo(() => graphOf(line), [line]);

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onSelectNode(undefined);

    window.addEventListener("keydown", clearOnEscape);

    return () => window.removeEventListener("keydown", clearOnEscape);
  }, [onSelectNode]);

  return (
    <div className={styles.screen}>
      <div className={styles.primary}>
        <LineHeader line={line} />
        <div className={styles.graph}>
          <RunGraphView definition={definition} selectedNodeId={node?.id} onSelectNode={onSelectNode} />
        </div>
        <ProblemsList problems={line.problems} onSelectNode={onSelectNode} />
      </div>
      <Inspector node={node} actions={inspector} />
    </div>
  );
}
