import type { NodeView } from "@protocol";

type PlaceholderRow = NonNullable<NodeView["placeholders"]>["placeholders"][number];

/** The Prompt panel's table of the prompt's placeholders. */
export default function PlaceholdersTable({ rows }: { rows: PlaceholderRow[] }) {
  return (
    <table aria-label="Placeholders">
      <thead>
        <tr>
          <th>name</th>
          <th>source</th>
          <th>state</th>
          <th>filled by</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>{row.name}</td>
            <td>{row.source}</td>
            <td>{row.state}</td>
            <td>{row.filledBy.join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
