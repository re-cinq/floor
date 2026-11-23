// What a page's generated regions hold: a field table from the schemas, or an example file as it is on disk.
import { fieldTable, tableAt } from "./field-table.js";
import { TABLES, type Reference } from "./reference.js";

export interface Sources {
  reference: Reference;
  /** The text of a file under `examples/`. */
  example(path: string): string;
}

const LANGUAGES = new Map([
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["json", "json"],
  ["mjs", "js"],
  ["ts", "ts"],
]);

export function regionOf(name: string, sources: Sources): string {
  const [kind, ...rest] = name.split(":");
  const named = rest.join(":");

  if (kind === "fields") return fieldsOf(named, sources.reference);
  if (kind === "example") return exampleOf(named, sources.example(named));

  throw new Error(`a generated region is fields:<table> or example:<path>, and not "${name}"`);
}

function fieldsOf(table: string, reference: Reference): string {
  if (!Object.hasOwn(TABLES, table)) throw new Error(`no field table is named "${table}": ${Object.keys(TABLES).join(", ")}`);
  const [root, ...steps] = TABLES[table];

  return fieldTable(tableAt(reference[root], steps));
}

// Four backticks, as an agent file holds a prompt that may fence code of its own.
function exampleOf(path: string, text: string): string {
  const extension = path.split(".").at(-1) ?? "";
  const title = path.split("/").slice(1).join("/") || path;

  return `\`\`\`\`${LANGUAGES.get(extension) ?? "text"} title="${title}"\n${text.trimEnd()}\n\`\`\`\``;
}
