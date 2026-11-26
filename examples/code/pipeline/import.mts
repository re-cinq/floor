// Install a pipeline from a file and inspect which definitions changed on the target Floor.
import { importPipeline, type Floor } from "@re-cinq/floor-pipeline";
import { readDefinition } from "./read.mts";

export async function installDefinition(
  // floor supplies the API URL and service token for the destination. https://re-cinq.github.io/floor/sdk/pipeline/#floor
  floor: Floor,
  // path points to the same YAML file accepted by the CLI. https://re-cinq.github.io/floor/specs/pipeline-file/
  path: string,
) {
  const pipeline = await readDefinition(path);

  // Each result names a definition and records whether the import created a version.
  return importPipeline(floor, pipeline);
}
