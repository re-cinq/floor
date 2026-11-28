// What the API reads from a request body. The bodies of a line, a station, an agent definition and a schedule are the pipeline package's, built to drop a key they do not know.
import { z } from "zod";
import { isValidCron, isValidTimezone } from "@floor/store";
import { definitionSchemas, itemKind } from "@re-cinq/floor-pipeline/definition-schemas";

export const { lineBodySchema, stationBodySchema, agentDefinitionBodySchema, scheduleBodySchema } = definitionSchemas(z.object, { isValidCron, isValidTimezone });

const startItem = z.object({ kind: itemKind, ref: z.string(), by: z.string(), sha: z.string().optional() });

export const startRunSchema = z.object({
  repo: z.string().min(1).optional().transform((repo) => repo ?? null),
  startItems: z.record(z.string(), startItem),
  entry: z.string().optional(),
  lineHash: z.string().optional(),
});

const coercedDate = z.coerce.date();

export const enqueueEventSchema = z.object({
  name: z.string(),
  payload: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().optional(),
  availableAt: coercedDate.optional(),
  runId: z.string().optional(),
});

const subsystemVersionsSchema = z.object({ version: z.string(), clis: z.record(z.string(), z.string()) });

const modelCatalogStatusSchema = z.object({
  refreshedAt: z.string(),
  vendors: z.array(
    z.object({
      vendor: z.string(),
      provider: z.string(),
      secretRefs: z.array(z.string()),
      error: z.string(),
      models: z.array(z.object({ id: z.string(), displayName: z.string() })),
    }),
  ),
});

export const registerClusterSchema = z.object({
  tags: z.array(z.string()),
  build: z.string().optional(),
  subsystem: subsystemVersionsSchema.nullable().optional(),
  models: modelCatalogStatusSchema.nullable().optional(),
});

export const claimEventsSchema = z.object({ tags: z.array(z.string()), limit: z.number().int().positive() });

export const failEventSchema = z.object({ error: z.string(), permanent: z.boolean() });

export const recordKindSchema = z.enum(["log", "turn", "llm_call"]);

export const createRecordsSchema = z.object({
  records: z.array(z.object({ kind: recordKindSchema, body: z.unknown(), occurredAt: coercedDate })).min(1),
});
