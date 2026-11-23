import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import { raisedSentence } from "./raised-wording";
import { startedBySentence } from "./start-origin-wording";

/** The inspector's Events panel: the events that start the node and the ones that answer it. */
export default function EventsPanel({ node: { events } }: { node: NodeView }) {
  return (
    <>
      <LabelledList label="Started by" entries={events.startedBy.map(startedBySentence)} />
      <LabelledList
        label="Answered by"
        entries={events.answeredBy.map(({ event, outcome }) => `${event}, reports ${outcome}`)}
      />
      <LabelledList label="Raises" entries={events.raises.map(raisedSentence)} />
    </>
  );
}
