// One line of a collection folder as the local test run's rules read it.
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { TestLine } from "../test-run/test-line.js";
import { readLinesIn } from "./read-collection-view.js";

export async function readTestLine(dir: string, lineId: string): Promise<TestLine> {
  const lines = await readLinesIn(dir);
  const line = lines.find(({ id }) => id === lineId);
  enforce(line, `the collection has no line ${lineId}`);

  return { id: line.id, body: line.body, stations: line.bodies };
}
