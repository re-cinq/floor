import FieldFrame from "./FieldFrame";
import type { Property } from "./schema-property";

type Grid = Record<string, Record<string, string> | undefined>;

interface GridFieldProps {
  name: string;
  value: unknown;
  help?: string;
  property?: Property;
  onChange: (value: Record<string, Record<string, string>> | undefined) => void;
}

/** One row per outer key, one column per inner key, each cell a text input. */
export default function GridField({ name, value, help, property, onChange }: GridFieldProps) {
  const rows = Object.keys(property?.properties ?? {});
  const columns = columnsOf(property);

  return (
    <FieldFrame name={name} help={help}>
      {() => (
        <table>
          <thead>
            <tr>
              <th />
              {columns.map(([column]) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <GridRow key={row} name={name} row={row} columns={columns} grid={(value ?? {}) as Grid} onChange={onChange} />
            ))}
          </tbody>
        </table>
      )}
    </FieldFrame>
  );
}

function columnsOf(property: Property | undefined): [string, Property][] {
  return Object.entries(Object.values(property?.properties ?? {})[0]?.properties ?? {});
}

interface GridRowProps {
  name: string;
  row: string;
  columns: [string, Property][];
  grid: Grid;
  onChange: GridFieldProps["onChange"];
}

function GridRow({ name, row, columns, grid, onChange }: GridRowProps) {
  return (
    <tr>
      <th>{row}</th>
      {columns.map(([column, cell]) => (
        <td key={column}>
          <input aria-label={`${name} ${row} ${column}`} title={cell.description} value={grid[row]?.[column] ?? ""} onChange={(event) => onChange(editCell(grid, { row, column }, event.target.value))} />
        </td>
      ))}
    </tr>
  );
}

function editCell(grid: Grid, cell: { row: string; column: string }, text: string): Record<string, Record<string, string>> | undefined {
  const cells = withoutEmpty({ ...grid[cell.row], [cell.column]: text });
  const next = Object.fromEntries(Object.entries({ ...grid, [cell.row]: cells }).filter(([, entries]) => Object.keys(entries ?? {}).length > 0));

  return Object.keys(next).length === 0 ? undefined : (next as Record<string, Record<string, string>>);
}

function withoutEmpty(cells: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(cells).filter(([, cell]) => cell !== ""));
}
