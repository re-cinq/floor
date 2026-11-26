// Inspect the Hello World graph and switch from its definition to the route of a completed run.
import { useState } from "react";
import { RunGraphView } from "@re-cinq/floor-graph";
import { definition, visits } from "./hello";
import "./graph.css";

export default function App() {
  // onSelectNode supplies the clicked node ID; selectedNodeId marks it. https://re-cinq.github.io/floor/sdk/graph/#rungraphviewprops
  const [selectedId, selectNode] = useState<string | null>(null);
  const [completed, showCompleted] = useState(false);
  const selected = definition.nodes.find(node => node.id === selectedId);

  return (
    <main className="hello-graph">
      <label>
        <input type="checkbox" checked={completed} onChange={event => showCompleted(event.target.checked)} />
        Show completed run
      </label>
      <RunGraphView
        definition={definition}
        run={completed ? { visits } : undefined}
        selectedNodeId={selectedId}
        onSelectNode={selectNode}
      />
      <p role="status" aria-label="Selected node">{selected?.description ?? "Select a node to see its description."}</p>
    </main>
  );
}
