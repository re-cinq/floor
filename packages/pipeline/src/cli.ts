#!/usr/bin/env node
// floor-pipeline: a pipeline as one file, out of a floor and into one.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { exportPipeline, lineIds } from "./export.js";
import { readPipelineFile, writePipelineFile } from "./file.js";
import type { Floor } from "./floor.js";
import { importPipeline, type Put } from "./import.js";
import { migrate } from "./migrate.js";
import { fileOf, pipelineOf } from "./shape.js";

const USAGE = `floor-pipeline <what to do> --floor <url>      with FLOOR_SERVICE_TOKEN

  export <line>              one pipeline, written to standard output, or to --out <file>
  export --all --dir <dir>   every pipeline, one file each, named after its line: a backup
  import <file>...           puts each file to the floor. The same file twice changes nothing
  migrate <dir>              the folder's files in the order of their names, each once.
                             The floor remembers which ran`;

const OPTIONS = { floor: { type: "string" }, out: { type: "string" }, dir: { type: "string" }, all: { type: "boolean" } } as const;

type Given = ReturnType<typeof given>;

function given() {
  return parseArgs({ options: OPTIONS, allowPositionals: true });
}

async function main(): Promise<void> {
  const told = given();
  const [command = ""] = told.positionals;
  const commands: Partial<Record<string, (floor: Floor, told: Given) => Promise<void>>> = { export: exported, import: imported, migrate: migrated };
  const run = commands[command];

  if (!run) throw new Error(USAGE);
  await run(floorOf(told), told);
}

function floorOf(told: Given): Floor {
  const token = process.env.FLOOR_SERVICE_TOKEN;
  const url = told.values.floor;

  if (!url || !token) throw new Error(`a floor is named with --floor, and reached with FLOOR_SERVICE_TOKEN\n\n${USAGE}`);

  return { url: url.replace(/\/$/, ""), token };
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

function said(file: string, put: Put[]): void {
  console.log(`${file}:`);
  put.forEach((each) => console.log(`  ${each.kind}/${each.id}: ${each.changed ? "changed" : "as it was"}`));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
