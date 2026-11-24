import type { RunOutput } from "./use-run";

/** Each line the run printed, stderr marked. */
export default function RunTranscript({ lines }: { lines: RunOutput[] }) {
  return (
    <section aria-label="Transcript">
      {lines.map((line, index) => (
        <p key={index}>{line.stream === "stderr" ? `stderr: ${line.text}` : line.text}</p>
      ))}
    </section>
  );
}
