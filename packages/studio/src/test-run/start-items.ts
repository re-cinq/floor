// The start items of a local test run, from what the person entered for each declared argument and line file.
import type { Item } from "@re-cinq/floor-contracts";
import { enteredValue } from "./entered-value.js";
import type { TestLine } from "./test-line.js";

export interface StartItems {
  items: Record<string, Item>;
  missing: string[];
}

export function startItemsOf(line: TestLine, entered: Readonly<Record<string, string>>): StartItems {
  const asked = askedOf(line);
  const missing = asked.filter(([name]) => enteredValue(entered, name) === undefined).map(([name]) => name);
  if (missing.length > 0) return { items: {}, missing };

  const entries = asked.map(([name, kind]): [string, Item] => [name, startItem(kind, enteredValue(entered, name)!)]);

  return { items: Object.fromEntries(entries), missing };
}

function askedOf(line: TestLine): [string, Item["kind"]][] {
  const argEntries = Object.entries(line.body.args).map(([name, arg]): [string, Item["kind"]] => [name, arg.kind]);
  const fileNames = Object.keys(line.body.files ?? {}).filter((name) => !Object.hasOwn(line.body.args, name));

  return [...argEntries, ...fileNames.map((name): [string, Item["kind"]] => [name, "file"])];
}

function startItem(kind: Item["kind"], ref: string): Item {
  return { kind, ref, by: "start" };
}
