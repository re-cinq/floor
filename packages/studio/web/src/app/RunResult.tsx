import type { NodeView } from "@protocol";
import { raisedSentence } from "./raised-wording";
import type { RunEnded } from "./use-run";

/** How a run ended: its outcome, exit code, what it produced and the edge it took. */
export default function RunResult({ ended, raises }: { ended: RunEnded; raises: NodeView["events"]["raises"] }) {
  const { exitCode, outcome, produced = [], edge } = ended;

  return (
    <section aria-label="Run result">
      <p>{exitCode === null ? "cancelled" : (outcome ?? "no outcome")}</p>
      <p>exit code {exitCode ?? "none"}</p>
      <ul>
        {produced.map(({ name, found }) => <li key={name}>{name} {found ? "found" : "missing"}</li>)}
      </ul>
      {edge && <p>{edge.from} to {edge.to}</p>}
      <RaisedNext raises={raises} outcome={outcome} />
    </section>
  );
}

function RaisedNext({ raises, outcome }: { raises: NodeView["events"]["raises"]; outcome?: string }) {
  const raised = raises.filter((entry) => entry.kind === "outcome" && entry.outcome === outcome);

  return raised.length > 0 && (
    <section aria-label="Raised next">
      <ul>
        {raised.map((entry) => <li key={raisedSentence(entry)}>{raisedSentence(entry)}</li>)}
      </ul>
    </section>
  );
}
