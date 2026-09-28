// zod mirrors of packages/store's definition body types (docs/entities/*.md), for POST/PUT validation.
import { z } from "zod";
import { agentConfigSchema } from "./agent-config.js";

const itemKind = z.enum(["value", "file", "git"]);

const lineArgSpec = z.object({ kind: itemKind, subject: z.boolean().optional() });

const whenValue = z.union([z.string(), z.number(), z.boolean()]);

const lineStart = z.object({
  on: z.array(z.string()),
  when: z.record(z.string(), whenValue).optional(),
  args: z.record(z.string(), z.string()),
});

const lineNodeReport = z.object({ on: z.string(), when: z.record(z.string(), whenValue).optional(), outcome: z.string() });

const lineNode = z.object({
  id: z.string(),
  station: z.string().optional(),
  start: z.string().optional(),
  bind: z.record(z.string(), z.string()).optional(),
  reports: z.array(lineNodeReport).optional(),
});

const lineEdge = z.object({ from: z.string(), to: z.string(), on: z.string(), iterationMax: z.number().int().positive().optional() });

export const lineBodySchema = z.object({
  entry: z.string(),
  exit: z.string(),
  start: lineStart.optional(),
  args: z.record(z.string(), lineArgSpec),
  files: z.record(z.string(), z.string()).optional(),
  nodes: z.array(lineNode),
  edges: z.array(lineEdge),
});

const needSpec = z.object({
  name: z.string(),
  kind: itemKind,
  path: z.string().optional(),
  access: z.enum(["read", "write"]).optional(),
  optional: z.boolean().optional(),
});

const produceSpec = z
  .object({ name: z.string(), kind: z.enum(["value", "file"]), path: z.string().optional(), from: z.literal("output").optional() })
  .refine((produce) => !produce.from || (produce.kind === "file" && !produce.path), { message: "from: output is for a file, and takes no path" });

export const stationBodySchema = z.object({
  kind: z.enum(["agent", "service", "human"]),
  agentDefinition: z.string().optional(),
  conversation: z.enum(["new", "continue"]).optional(),
  conversationKey: z.string().optional(),
  outcomes: z.array(z.string()),
  mustChange: z.boolean().optional(),
  needs: z.array(needSpec),
  produces: z.array(produceSpec),
  url: z.string().optional(),
  route: z.string().optional(),
});

const agentSettings = z.object({
  model: z.string().optional(),
  prompt: z.string(),
  image: z.string(),
  timeoutMinutes: z.number().int().positive(),
  tags: z.array(z.string()).optional(),
  config: agentConfigSchema.optional(),
});

export const agentDefinitionBodySchema = z.object({
  settings: agentSettings,
  variants: z.record(z.string(), agentSettings.partial()).optional(),
});

const startItem = z.object({ kind: itemKind, ref: z.string(), by: z.string(), sha: z.string().optional() });

export const startRunSchema = z.object({
  repo: z.string(),
  startItems: z.record(z.string(), startItem),
  entry: z.string().optional(),
});

const coercedDate = z.coerce.date();

export const enqueueEventSchema = z.object({
  name: z.string(),
  payload: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().optional(),
  availableAt: coercedDate.optional(),
  runId: z.string().optional(),
});

export const claimEventsSchema = z.object({ tags: z.array(z.string()), limit: z.number().int().positive() });

export const failEventSchema = z.object({ error: z.string(), permanent: z.boolean() });

export const recordKindSchema = z.enum(["log", "turn", "llm_call"]);

export const createRecordsSchema = z.object({
  records: z.array(z.object({ kind: recordKindSchema, body: z.unknown(), occurredAt: coercedDate })).min(1),
});
