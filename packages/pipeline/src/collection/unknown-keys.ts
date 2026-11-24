// The unknown-key lint rule: a key in a body that the floor does not know, read with closed schemas.
import { z } from "zod";
import { definitionSchemas } from "../definition-schemas.js";
import { FILE_SPELLING, type Named, type Pipeline } from "../shape.js";
import type { PipelineProblem } from "./lint-shape.js";

const { lineBodySchema, stationBodySchema, agentDefinitionBodySchema, scheduleBodySchema } = definitionSchemas(z.strictObject);

interface CheckedBody {
  at: string;
  schema: z.ZodType;
  body: unknown;
}

function inFile(field: string): string {
  return FILE_SPELLING[field] ?? field;
}

function fieldPath(steps: PropertyKey[]): string {
  return steps.map((step) => (typeof step === "number" ? `[${step}]` : `.${inFile(String(step))}`)).join("");
}

function bodiesUnder(fileKey: string, schema: z.ZodType, items: Named[]): CheckedBody[] {
  return items.map(({ id, body }) => ({ at: `${fileKey}.${id}`, schema, body }));
}

function checkedBodies(pipeline: Pipeline): CheckedBody[] {
  return [
    ...(pipeline.line ? [{ at: "line", schema: lineBodySchema, body: pipeline.line.body }] : []),
    ...bodiesUnder("stations", stationBodySchema, pipeline.stations),
    ...bodiesUnder("agent_definitions", agentDefinitionBodySchema, pipeline.agentDefinitions),
    ...bodiesUnder("schedules", scheduleBodySchema, pipeline.schedules),
  ];
}

function unknownKeysIn({ at, schema, body }: CheckedBody): { path: string; key: string }[] {
  const issues = schema.safeParse(body).error?.issues ?? [];
  return issues
    .filter((issue) => issue.code === "unrecognized_keys")
    .flatMap((issue) => issue.keys.map((key) => ({ path: `${at}${fieldPath(issue.path)}`, key: inFile(key) })));
}

export function unknownKeys(pipeline: Pipeline): PipelineProblem[] {
  return checkedBodies(pipeline)
    .flatMap(unknownKeysIn)
    .map(({ path, key }) => ({ line: pipeline.line?.id ?? "", rule: "unknown-key" as const, detail: `${path}: unknown key "${key}"` }));
}
