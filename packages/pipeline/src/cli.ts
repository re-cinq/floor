#!/usr/bin/env node
// floor-pipeline: a pipeline as one file, out of a floor and into one.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { exportPipeline, lineIds } from "./export.js";
import { readPipelineFile, writePipelineFile } from "./file.js";
import type { Floor } from "./floor.js";
import { floorGiven } from "./floor-given.js";
import { importPipeline, type Put } from "./import.js";
import { migrate } from "./migrate.js";
import { applyCollection } from "./collection/apply.js";
import { printCollectionLint, readCollectionDirectory } from "./collection/lint-directory.js";
import { waitUntilReady } from "./ready.js";
import { fileOf, pipelineOf } from "./shape.js";

const USAGE = `floor-pipeline <what to do> --floor <url>      with FLOOR_SERVICE_TOKEN
                               --floor may be left out when FLOOR_API_URL names the floor

  export <line>              one pipeline, written to standard output, or to --out <file>
  export --all --dir <dir>   every pipeline, one file each, named after its line: a backup
  import <file>...           puts each file to the floor. The same file twice changes nothing
  migrate <dir>              the folder's files in the order of their names, each once.
                             The floor remembers which ran
  apply <dir>                puts a collection to the floor: its agents, then each line with its stations.
                             \${NAME} in its files is filled from this environment. Nothing is put
                             when a file is refused
  lint <dir>                 checks a collection: one folder a line, with its pipeline.yaml and agents/.
                             Needs no floor and no token. A key the host owns is named with --host-key <name>,
                             as often as needed

  --wait-ready <seconds>     first waits up to that long for the floor's /readyz to answer 200,
                             for a job that starts with the floor`;

const OPTIONS = { floor: { type: "string" }, out: { type: "string" }, dir: { type: "string" }, all: { type: "boolean" }, "wait-ready": { type: "string" }, "host-key": { type: "string", multiple: true } } as const;

type Given = ReturnType<typeof given>;

function given() {
  return parseArgs({ options: OPTIONS, allowPositionals: true });
}

async function main(): Promise<void> {
  const told = given();
  const [command = ""] = told.positionals;

  if (command === "lint") return linted(told);
  const commands: Partial<Record<string, (floor: Floor, told: Given) => Promise<void>>> = { export: exported, import: imported, migrate: migrated, apply: applied };
  const run = commands[command];

  if (!run) throw new Error(USAGE);
  const floor = floorGiven(told.values.floor, process.env, USAGE);

  await waitedFor(floor, told.values["wait-ready"]);
  await run(floor, told);
}

async function waitedFor(floor: Floor, waitReady: string | undefined): Promise<void> {
  if (waitReady === undefined) return;
  const seconds = Number(waitReady);

  if (!(seconds > 0)) throw new Error(`--wait-ready is a number of seconds above 0, and not "${waitReady}"`);
  await waitUntilReady({ floorUrl: floor.url, seconds });
}

async function exported(floor: Floor, told: Given): Promise<void> {
  const [, line] = told.positionals;

  if (told.values.all) return backedUp(floor, told.values.dir);
  if (!line) throw new Error(USAGE);
  const written = writePipelineFile(fileOf(await exportPipeline(floor, line)));

  if (!told.values.out) return void process.stdout.write(written);
  await writeFile(told.values.out, written);
}

async function backedUp(floor: Floor, dir: string | undefined): Promise<void> {
  if (!dir) throw new Error("export --all writes a file a pipeline, into --dir <dir>");
  await mkdir(dir, { recursive: true });
  const lines = await lineIds(floor);

  await Promise.all(lines.map(async (line) => writeFile(join(dir, `${line}.yaml`), writePipelineFile(fileOf(await exportPipeline(floor, line))))));
  console.error(`${lines.length} pipeline(s) written to ${dir}`);
}

async function imported(floor: Floor, told: Given): Promise<void> {
  const [, ...files] = told.positionals;

  if (files.length === 0) throw new Error(USAGE);
  for (const file of files) said(file, await importPipeline(floor, pipelineOf(readPipelineFile(await readFile(file, "utf8")))));
}

async function migrated(floor: Floor, told: Given): Promise<void> {
  const [, dir] = told.positionals;

  if (!dir) throw new Error(USAGE);
  const names = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name));
  const files = await Promise.all(names.map(async (name) => ({ name, text: await readFile(join(dir, name), "utf8") })));
  const all = await migrate(floor, files);

  all.forEach((each) => (each.ran ? said(each.name, each.put) : console.log(`${each.name}: ran before`)));
}

async function applied(floor: Floor, told: Given): Promise<void> {
  const [, dir] = told.positionals;

  if (!dir) throw new Error(USAGE);
  const overlay = await readCollectionDirectory(dir, { hostKeys: told.values["host-key"] ?? [], env: process.env });

  const refusals = overlay.refused.map(({ path, reason }) => `${path}: ${reason}`);

  if (refusals.length > 0) throw new Error(refusals.join("\n"));
  said(dir, await applyCollection(floor, overlay));
}

async function linted(told: Given): Promise<void> {
  const [, dir] = told.positionals;

  if (!dir) throw new Error(USAGE);
  process.exitCode = await printCollectionLint(dir, told.values["host-key"] ?? [], console.log);
}

function said(file: string, put: Put[]): void {
  console.log(`${file}:`);
  put.forEach((each) => console.log(`  ${each.kind}/${each.id}: ${each.changed ? "changed" : "as it was"}`));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
