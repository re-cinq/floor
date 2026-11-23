// How the Events panel words each thing a node raises; adding a kind's phrase is one entry in `WORDINGS`.
import type { NodeView } from "@protocol";
import { conditionWording } from "./condition-wording";

type Raised = NodeView["events"]["raises"][number];
type RaisedOf<Kind extends Raised["kind"]> = Extract<Raised, { kind: Kind }>;

const eventSentence = ({ event }: RaisedOf<"event">) => event;
const edgeSuffix = (outcome: string, edgeOn: string) => (edgeOn === outcome ? "" : ` by the edge taken ${edgeOn}`);
const outcomeSentence = ({ outcome, leadsTo }: RaisedOf<"outcome">) =>
  leadsTo
    ? `on ${outcome}, ${leadsTo.event} starts ${leadsTo.node}${edgeSuffix(outcome, leadsTo.on)}`
    : `on ${outcome}, no edge leads on: the run stops here`;

const startsLineSentence = ({ line, when }: RaisedOf<"starts-line">) =>
  `when the run settles, starts the line ${line}${conditionWording(when)}`;

const WORDINGS: { [Kind in Raised["kind"]]: (raised: RaisedOf<Kind>) => string } = {
  event: eventSentence,
  outcome: outcomeSentence,
  "starts-line": startsLineSentence,
};

/** The entry telling what a node raises. */
export function raisedSentence<Kind extends Raised["kind"]>(raised: RaisedOf<Kind> & { kind: Kind }): string {
  const wording: (raised: RaisedOf<Kind>) => string = WORDINGS[raised.kind];

  return wording(raised);
}
