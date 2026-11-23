// How the Events panel words each way a start event arrives; adding an origin's phrase is one entry in `WORDINGS`.
import type { NodeView } from "@protocol";
import { conditionWording } from "./condition-wording";

type StartedBy = NodeView["events"]["startedBy"][number];

const WORDINGS: { [Origin in StartedBy["origin"]]: string } = {
  walk: "when an edge leads here",
  outside: "from outside the line",
  "line-start": "when the line starts",
  none: "raised by nothing",
};

/** The entry telling an event and how it starts the node. */
export function startedBySentence({ event, origin, when }: StartedBy): string {
  return `${event}, ${WORDINGS[origin]}${conditionWording(when)}`;
}
