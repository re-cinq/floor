import { useEffect, useMemo } from "react";
import type { LineView, NodeView } from "@protocol";
import { graphOf } from "@/graph/graph-of";
import RunGraphView from "@/graph/RunGraphView";
import Inspector from "./Inspector";
import LineHeader from "./LineHeader";
import ProblemsList from "./ProblemsList";
import styles from "./line.module.css";

export interface LineScreenProps {
  line: LineView;
  node: NodeView | undefined;
  onSelectNode: (nodeId: string | undefined) => void;
}

export default function LineScreen({ line, node, onSelectNode }: LineScreenProps) {
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
        <RunGraphView definition={definition} selectedNodeId={node?.id} onSelectNode={onSelectNode} />
        <ProblemsList problems={line.problems} onSelectNode={onSelectNode} />
      </div>
      <Inspector node={node} />
    </div>
  );
}
