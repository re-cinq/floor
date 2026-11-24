// Checks which declared produces of a station a run left: a file produce in the run folder, a produce from output in the agent's final answer.
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StationBody } from "@re-cinq/floor-contracts";

interface ProducesFoundInput {
  station: StationBody;
  folder: string;
  /** The agent's final answer, which a produce `from: output` holds. */
  answer?: string;
}

type Produce = StationBody["produces"][number];

export function producesFound({ station, folder, answer }: ProducesFoundInput): Promise<{ name: string; found: boolean }[]> {
  const checked = station.produces.filter((produce) => produce.kind === "file" && (produce.path || produce.from === "output"));

  return Promise.all(checked.map(async (produce) => ({ name: produce.name, found: await isFound(produce, folder, answer) })));
}

function isFound(produce: Produce, folder: string, answer: string | undefined): Promise<boolean> {
  if (produce.from === "output") return Promise.resolve(Boolean(answer?.trim()));

  return access(join(folder, produce.path as string)).then(
    () => true,
    () => false,
  );
}
