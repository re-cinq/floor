/** A list named by its label, one item per entry. */
export default function LabelledList({ label, entries }: { label: string; entries: readonly string[] }) {
  return (
    <ul aria-label={label}>
      {entries.map((entry) => (
        <li key={entry}>{entry}</li>
      ))}
    </ul>
  );
}
