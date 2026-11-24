import type { NodeView } from "@protocol";
import { raisedSentence } from "./raised-wording";
import type { RunEnded } from "./use-run";

/** How a run ended: its outcome, exit code, what it produced and the edge it took, each under its label. */
export default function RunResult({ ended, raises }: { ended: RunEnded; raises: NodeView["events"]["raises"] }) {
  return (
    <section aria-label="Run result">
      <dl>
        {resultRows(ended).map(([label, value]) => [<dt key={`${label}-term`}>{label}</dt>, <dd key={`${label}-value`}>{value}</dd>])}
      </dl>
      <RaisedNext raises={raises} outcome={ended.outcome} />
    </section>
  );
}

function resultRows(ended: RunEnded): [string, string][] {
  const rows: [string, string | undefined][] = [
    ["Outcome", outcomeText(ended)],
    ["Exit code", String(ended.exitCode ?? "none")],
    ["Produces", producedText(ended.produced ?? [])],
    ["Edge taken", ended.edge && `${ended.edge.from} → ${ended.edge.to}`],
  ];

  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

function outcomeText({ exitCode, outcome }: RunEnded): string {
  return exitCode === null ? "cancelled" : (outcome ?? "no outcome");
}

function producedText(produced: NonNullable<RunEnded["produced"]>): string {
  return produced.map(({ name, found }) => `${name} ${found ? "found" : "missing"}`).join(", ");
}

function RaisedNext({ raises, outcome }: { raises: NodeView["events"]["raises"]; outcome?: string }) {
  const raised = raises.filter((entry) => entry.kind === "outcome" && entry.outcome === outcome);

  return raised.length > 0 && (
    <section aria-label="Raised next">
      <h4>Raised next</h4>
      <ul>
        {raised.map((entry) => <li key={raisedSentence(entry)}>{raisedSentence(entry)}</li>)}
      </ul>
    </section>
  );
}
