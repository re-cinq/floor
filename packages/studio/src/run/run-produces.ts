// Checks which declared file produces of a station exist in the run folder.
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StationBody } from "@re-cinq/floor-contracts";

interface ProducesFoundInput {
  station: StationBody;
  folder: string;
}

export function producesFound({ station, folder }: ProducesFoundInput): Promise<{ name: string; found: boolean }[]> {
  const fileProduces = station.produces.filter((produce) => produce.kind === "file" && produce.path);

  return Promise.all(
    fileProduces.map(async ({ name, path }) => ({
      name,
      found: await access(join(folder, path as string)).then(
        () => true,
        () => false,
      ),
    })),
  );
}
