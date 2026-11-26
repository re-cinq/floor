// Read a local pipeline into memory so a tool can inspect its definitions before contacting Floor.
import { readFile } from "node:fs/promises";
import { pipelineOf, readPipelineFile } from "@re-cinq/floor-pipeline";

export async function readDefinition(
  // path names a YAML file using the pipeline format. https://re-cinq.github.io/floor/specs/pipeline-file/
  path: string,
) {
  const yaml = await readFile(path, "utf8");

  // Check the file's structure, then convert its YAML field names into Floor's in-memory representation.
  return pipelineOf(readPipelineFile(yaml));
}
