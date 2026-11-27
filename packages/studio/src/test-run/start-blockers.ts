// The reasons an assembly line cannot be started as a local test run.
import { enforce, validateLine } from "@re-cinq/floor-assembly-lines";
import type { TestLine } from "./test-line.js";

export function startBlockers(line: TestLine): string[] {
  return [...validatorProblems(line), ...pinRefusals(line), ...fanOutRefusals(line)];
}

export function enforceStartable(lineId: string, line: TestLine, missing: readonly string[]): void {
  const reasons = [...startBlockers(line), ...(missing.length > 0 ? [`${missing.join(", ")} is missing`] : [])];

  enforce(reasons.length === 0, `${lineId} cannot start: ${reasons.join("; ")}`);
}

function validatorProblems({ body, stations }: TestLine): string[] {
  return validateLine(body, { stations: new Set(stations.keys()), bodies: stations });
}

function pinRefusals({ body }: TestLine): string[] {
  return body.nodes.flatMap((node) =>
    node.station?.includes("@")
      ? [`node ${node.id} pins station ${node.station}, and a local test run only has the station its file defines: remove the pin to test it`]
      : [],
  );
}

function fanOutRefusals({ body }: TestLine): string[] {
  return body.nodes.flatMap((node) =>
    node.fanout ? [`node ${node.id} fans out to ${node.fanout.to}, and a local test run cannot fan out yet`] : [],
  );
}
