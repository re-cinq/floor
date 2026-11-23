import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PIPELINE_RULES } from "@re-cinq/floor-pipeline";
import { expect, it } from "vitest";

const specification = readFileSync(join(import.meta.dirname, "../../../website/src/content/docs/specs/collection.md"), "utf8");

it("lists every rule of a collection's lint in the collection's specification, by its id", () => {
  expect(PIPELINE_RULES.filter((rule) => !specification.includes(`| \`${rule}\` |`))).toEqual([]);
});
