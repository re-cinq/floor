#!/usr/bin/env node
// docs-reference: writes the generated regions of the website's pages and its JSON Schema files. With --check it writes nothing and fails on what would change.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { regionOf } from "./generate.js";
import { reference } from "./reference.js";
import { fillRegions } from "./regions.js";

const ROOT = join(import.meta.dirname, "../../..");
const PAGES = join(ROOT, "website/src/content/docs");
const SCHEMAS = join(ROOT, "website/public/schemas");
const EXAMPLES = join(ROOT, "examples");

interface Written {
  path: string;
  text: string;
}

async function main(): Promise<void> {
  const isCheck = process.argv.includes("--check");
  const all = [...(await pages()), ...schemas()];
  const before = await Promise.all(all.map(async (each) => held(each.path)));
  const changed = all.filter((each, index) => each.text !== before[index]);

  if (!isCheck) await Promise.all(changed.map(async (each) => mkdir(dirname(each.path), { recursive: true }).then(async () => writeFile(each.path, each.text))));
  changed.forEach((each) => console.log(`${isCheck ? "stale" : "written"}: ${each.path.slice(ROOT.length + 1)}`));
  if (isCheck && changed.length > 0) throw new Error("the website's generated parts are behind the code: run npm run docs:generate");
}

async function pages(): Promise<Written[]> {
  const sources = { reference: reference(), example: (path: string) => readFileSync(join(EXAMPLES, path), "utf8") };
  const names = (await readdir(PAGES, { recursive: true })).filter((name) => /\.mdx?$/.test(name));

  return Promise.all(
    names.map(async (name) => {
      const path = join(PAGES, name);

      return { path, text: fillRegions(await readFile(path, "utf8"), (region) => regionOf(region, sources)) };
    }),
  );
}

function schemas(): Written[] {
  const { pipeline, agent } = reference();
  const written = (schema: unknown): string => `${JSON.stringify(schema, null, 2)}\n`;

  return [
    { path: join(SCHEMAS, "pipeline.schema.json"), text: written(pipeline) },
    { path: join(SCHEMAS, "agent.schema.json"), text: written(agent) },
  ];
}

async function held(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
