#!/usr/bin/env node
// floor-convert-lore: reads a lore checkout, writes what this floor runs in a line's place. It reads lore and changes nothing there.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { convertLine, type Conversion } from "./convert.js";
import type { ConvertOptions } from "./nodes.js";
import { parseLine, parseRecipe, type LoreLine, type LoreRecipe } from "./lore.js";
import { putConversion } from "./put.js";

const LINES = "libs/assembly-lines/src/assembly-lines";
const RECIPES = "libs/shared/src/agent-defaults";

const USAGE = `floor-convert-lore --lore <checkout> (--line <name> | --all) [options]

  --image <image>          the image agents run in (default node:22-bookworm)
  --model <model>          replaces every node's model
  --skills-source <url>    where a pod fetches skills and the agent's settings
  --skill <name>           a skill every agent gets; may be given more than once
  --env <NAME=value>       set on every agent's pod; may be given more than once
  --model-secret-key <key> the key in the cluster's agent-secrets holding the model's credential
  --price <model=in/out>   what a model costs, in dollars for a million tokens read and written;
                           =in/out/cache-read/cache-write where the cache is priced apart. May be
                           given more than once: an agent calls other models on the side
  --put <floor url>        puts the result to a floor, with FLOOR_SERVICE_TOKEN
  --all                    every line, as a report of what converts and what is left`;

const OPTIONS = {
  lore: { type: "string" },
  line: { type: "string" },
  all: { type: "boolean" },
  image: { type: "string", default: "node:22-bookworm" },
  model: { type: "string" },
  "skills-source": { type: "string" },
  skill: { type: "string", multiple: true },
  env: { type: "string", multiple: true },
  "model-secret-key": { type: "string" },
  price: { type: "string", multiple: true },
  put: { type: "string" },
} as const;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: OPTIONS });
  const lore = values.lore;

  if (!lore || (!values.line && !values.all)) throw new Error(USAGE);
  const given = { image: values.image, model: values.model, skillsSource: values["skills-source"], skills: values.skill };
  const options = { ...given, env: envOf(values.env), modelSecretKey: values["model-secret-key"], prices: pricesOf(values.price) };
  const names = values.line ? [values.line] : await lineNames(lore);
  const recipes = await recipesOf(lore);
  const conversions = await Promise.all(names.map(async (name) => convertLine(await lineOf(lore, name), recipes, options)));

  await putAll(conversions, values.put);
  console.log(values.all ? report(conversions) : JSON.stringify(conversions[0], null, 2));
}

// `NAME=value`, cut at the first `=`: a value may hold one, as an address with a query does.
function envOf(listed: string[] | undefined): Record<string, string> | undefined {
  const pairs = (listed ?? []).map((entry) => [entry.slice(0, entry.indexOf("=")), entry.slice(entry.indexOf("=") + 1)]);

  return pairs.length > 0 ? Object.fromEntries(pairs) : undefined;
}

function pricesOf(listed: string[] | undefined): ConvertOptions["prices"] {
  const stated = (listed ?? []).map(priceOf);

  return stated.length > 0 ? Object.fromEntries(stated) : undefined;
}

const PRICED = ["inputPerMillion", "outputPerMillion", "cacheReadPerMillion", "cacheWritePerMillion"];
const PRICED_AT_LEAST = 2;

type Price = NonNullable<ConvertOptions["prices"]>[string];

// `model=in/out`, or `model=in/out/cache-read/cache-write`.
function priceOf(entry: string): [string, Price] {
  const [model, stated = ""] = entry.split("=");
  const rates = stated.split("/").map(Number);
  const readable = rates.length >= PRICED_AT_LEAST && rates.length <= PRICED.length && rates.every(Number.isFinite);

  if (!model || !readable) throw new Error(`--price takes model=in/out, in dollars for a million tokens: "${entry}"`);

  return [model, Object.fromEntries(rates.map((rate, place) => [PRICED[place], rate])) as unknown as Price];
}

async function putAll(conversions: Conversion[], floorUrl: string | undefined): Promise<void> {
  if (!floorUrl) return;

  await Promise.all(conversions.map((conversion) => putConversion(conversion, floorUrl)));
}

async function lineNames(lore: string): Promise<string[]> {
  const files = await readdir(join(lore, LINES));

  return files.filter((file) => file.endsWith(".yaml")).map((file) => file.replace(/\.yaml$/, ""));
}

async function lineOf(lore: string, name: string): Promise<LoreLine> {
  return parseLine(await readFile(join(lore, LINES, `${name}.yaml`), "utf8"));
}

async function recipesOf(lore: string): Promise<Record<string, LoreRecipe>> {
  const files = (await readdir(join(lore, RECIPES))).filter((file) => file.endsWith(".md"));
  const recipes = await Promise.all(files.map(async (file) => parseRecipe(file.replace(/\.md$/, ""), await readFile(join(lore, RECIPES, file), "utf8"))));

  return Object.fromEntries(recipes.map((recipe) => [recipe.name, recipe]));
}

function report(conversions: Conversion[]): string {
  return conversions.map(reportLine).join("\n");
}

function reportLine(conversion: Conversion): string {
  const line = conversion.line;
  const nodes = line.body.nodes;
  const counts = `${nodes.length} nodes, ${conversion.stations.length} stations, ${conversion.agentDefinitions.length} agent definitions`;
  const notes = conversion.notes.map((note) => `    - ${note}`);

  return [`${line.id}: ${counts}, ${conversion.notes.length} left to decide`, ...notes].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
