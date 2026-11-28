import { useEffect, useMemo, useRef } from "react";
import type { LineEdge } from "@re-cinq/floor-contracts";
import type { LineView, NodeView } from "@protocol";
import { graphOf } from "@/graph/graph-of";
import { RunGraphView, edgeKeyOf, mainPathOf } from "@re-cinq/floor-graph";
import Inspector, { type InspectorActions } from "./Inspector";
import LineHeader from "./LineHeader";
import LineInspector from "./LineInspector";
import ProblemsList from "./ProblemsList";
import TestRunsList from "./TestRunsList";
import { useCoveredBelow } from "./use-covered-below";
import type { TestRunListings } from "@/socket/studio-connection";
import styles from "./line.module.css";

export interface LineScreenProps {
  line: LineView;
  node: NodeView | undefined;
  inspector?: InspectorActions;
  takenEdge?: { from: string; to: string; on: string };
  onSelectNode: (nodeId: string | undefined) => void;
  onTestLocally: () => void;
  testRuns?: TestRunListings;
  onOpenTestRun?: (run: string) => void;
  onSelectLine?: (key: string) => void;
  selectedLineKey?: string;
  selectedLine?: LineEdge;
}

export default function LineScreen({ line, node, inspector, takenEdge, onSelectNode, onTestLocally, testRuns = [], onOpenTestRun, onSelectLine, selectedLineKey, selectedLine }: LineScreenProps) {
  const definition = useMemo(() => graphOf(line), [line]);
  const mainPathEdges = useMemo(() => mainPathOf(definition).edges, [definition]);
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
        <button type="button" className={styles.testLocally} onClick={onTestLocally}>
          Test locally
        </button>
        <TestRunsList runs={testRuns} onOpen={onOpenTestRun} />
        <div ref={graphRef} className={styles.graph}>
          <RunGraphView definition={definition} selectedNodeId={node?.id} coveredBelow={coveredBelow} takenEdge={takenEdge} onSelectNode={onSelectNode} onSelectLine={onSelectLine} selectedLineKey={selectedLineKey} />
        </div>
        <ProblemsList problems={line.problems} onSelectNode={onSelectNode} />
      </div>
      {selectedLine && <LineInspector line={selectedLine} onMainPath={mainPathEdges.has(edgeKeyOf(selectedLine))} />}
      {node && <Inspector node={node} actions={inspector} onClose={() => onSelectNode(undefined)} />}
    </div>
  );
}
