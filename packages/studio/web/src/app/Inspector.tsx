import type { NodeView } from "@protocol";
import styles from "./line.module.css";

/** The node inspector's place. It names the selected node and its station and nothing more: the Station, Events, Prompt and Settings tabs are built into this panel later. */
export default function Inspector({ node }: { node: NodeView | undefined }) {
  return (
    <aside className={styles.inspector} aria-label="Node inspector">
      <h2>node</h2>
      {node ? (
        <>
          <p className={styles.inspectorNode}>{node.id}</p>
          <p className="muted">{node.station ? `station ${node.station}` : "a marker, with no station"}</p>
        </>
      ) : (
        <p className="muted">Select a node in the graph to inspect it.</p>
      )}
    </aside>
  );
}
