// The bag of a local test run: start items folded with each visit's produced items, a station name standing in for its hash.
import { bagOf } from "@re-cinq/floor-assembly-lines";
import type { Item } from "@re-cinq/floor-contracts";
import type { TestRun } from "./test-visit.js";

export function bagOfRun(run: TestRun): Record<string, Item> {
  const { startItems, visits } = run;
  const { stations } = run.line;
  const producing = visits.map(({ id, station, report }) => ({ id, stationHash: station, report }));

  return bagOf(startItems, producing, (name) => stations.get(name)?.produces);
}
