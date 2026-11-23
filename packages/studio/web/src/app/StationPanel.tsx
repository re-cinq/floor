import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import { coverageSentence } from "./need-coverage-wording";

/** The inspector's Station panel: the description, each need with how it is covered, each produce with its readers, and the outcomes. */
export default function StationPanel({ node }: { node: NodeView }) {
  return (
    <>
      {node.description && <p>{node.description}</p>}
      <LabelledList label="Needs" entries={node.needs.map((need) => `${need.name}: ${coverageSentence(need.coverage)}`)} />
      <LabelledList label="Produces" entries={node.produces.map(({ name, readBy }) => (readBy.length ? `${name}: read by ${readBy.join(", ")}` : name))} />
      <LabelledList label="Outcomes" entries={node.outcomes} />
    </>
  );
}

