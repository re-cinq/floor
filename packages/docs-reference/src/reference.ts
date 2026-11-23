// The schemas a person's files are checked against, made from the floor's own: the pipeline file and the agent file, in the file's spelling.
import { agentDefinitionBodySchema, lineBodySchema, scheduleBodySchema, stationBodySchema } from "@floor/api/dist/schemas.js";
import { agentConfigSchema } from "@floor/api/dist/agent-config.js";
import { FILE_SPELLING, agentFrontmatterSchema, pipelineFileSchema } from "@re-cinq/floor-pipeline";
import { z } from "zod";
import type { JsonSchema } from "./field-table.js";
import { respelled } from "./json-schema.js";

export interface Reference {
  pipeline: JsonSchema;
  agent: JsonSchema;
}

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

export function reference(): Reference {
  return { pipeline: titled("A floor pipeline file", pipelineSchema()), agent: titled("The frontmatter of a floor agent file", agentSchema()) };
}

function titled(title: string, schema: JsonSchema): JsonSchema {
  return { $schema: DRAFT, title, ...schema };
}

function pipelineSchema(): JsonSchema {
  const outline = asWritten(pipelineFileSchema);
  const parts = outline.properties ?? {};

  return {
    ...outline,
    properties: {
      ...parts,
      line: lineSchema(parts.line),
      stations: { ...parts.stations, additionalProperties: asWritten(stationBodySchema) },
      agent_definitions: { ...parts.agent_definitions, additionalProperties: asWritten(agentDefinitionBodySchema) },
      schedules: { ...parts.schedules, additionalProperties: asWritten(scheduleBodySchema) },
    },
  };
}

// The file's own `id` and `files` over the floor's line: the floor takes a file by its hash, the file holds its content.
function lineSchema(outline: JsonSchema): JsonSchema {
  const body = asWritten(lineBodySchema);
  const { id, files } = outline.properties ?? {};

  return { ...body, description: outline.description, properties: { id, ...body.properties, files }, required: ["id", ...(body.required ?? [])] };
}

function agentSchema(): JsonSchema {
  const frontmatter = asWritten(agentFrontmatterSchema);
  const { config } = frontmatter.properties ?? {};

  return { ...frontmatter, properties: { ...frontmatter.properties, config: { ...asWritten(agentConfigSchema), description: config.description } } };
}

// As the file spells it, and closed: zod's own schema of what a parse gives refuses a key an object does not list, so a misspelt key shows where it is typed.
function asWritten(schema: z.ZodType): JsonSchema {
  const made = Object.fromEntries(Object.entries(z.toJSONSchema(schema)).filter(([keyword]) => keyword !== "$schema"));

  return respelled(made, FILE_SPELLING);
}

type Table = [root: keyof Reference, ...steps: string[]];

/** Every field table a page may ask for, and where its fields are. */
export const TABLES: Record<string, Table> = {
  pipeline: ["pipeline"],
  line: ["pipeline", "line"],
  "line.start": ["pipeline", "line", "start"],
  "line.arg": ["pipeline", "line", "args", "*"],
  node: ["pipeline", "line", "nodes", "[]"],
  "node.report": ["pipeline", "line", "nodes", "[]", "reports", "[]"],
  "node.fanout": ["pipeline", "line", "nodes", "[]", "fanout"],
  edge: ["pipeline", "line", "edges", "[]"],
  station: ["pipeline", "stations", "*"],
  need: ["pipeline", "stations", "*", "needs", "[]"],
  produce: ["pipeline", "stations", "*", "produces", "[]"],
  schedule: ["pipeline", "schedules", "*"],
  archive: ["pipeline", "archive"],
  agent: ["agent"],
  price: ["agent", "prices", "*"],
  config: ["agent", "config"],
  "mcp-server": ["agent", "config", "mcp_servers", "[]"],
  "secret-ref": ["agent", "config", "mcp_servers", "[]", "headers", "[]"],
  "pod-resources": ["agent", "config", "pod_resources"],
  "resource-quantities": ["agent", "config", "pod_resources", "requests"],
};
