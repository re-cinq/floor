import { useState } from "react";
import { transcriptEntries, type TranscriptEntry } from "./transcript-entries";
import type { RunOutput } from "./use-run";

/** What the run did, read for a person: what the agent said, the tools it called, what was refused, and the sum. Raw shows each line as printed. */
export default function RunTranscript({ lines }: { lines: RunOutput[] }) {
  const [raw, setRaw] = useState(false);
  const entries: TranscriptEntry[] = raw ? lines.map((line) => ({ kind: line.stream === "stderr" ? "error" : "raw", text: line.text })) : transcriptEntries(lines);

  return (
    <section aria-label="Transcript" data-transcript="">
      <button type="button" aria-pressed={raw} onClick={() => setRaw(!raw)}>
        Raw
      </button>
      <ol>
        {entries.map((entry, index) => (
          <li key={index} data-kind={entry.kind}>
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
