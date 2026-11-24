// Every frame between a client and the backend. No Node import here: a browser bundle takes this file, and the types of `view.ts`, which are erased.
import { z } from "zod";
import type { LineArgSpec, LineEdge, LineStart, StationKind } from "@re-cinq/floor-contracts";
import type { NodeEvents, PromptPlaceholders } from "@re-cinq/floor-assembly-lines";
import type { RunLine } from "./run/run-process.js";
import type { RunPreview } from "./run/run-preview.js";
import type { CollectionView, NodeNeed, NodeProduce } from "./view.js";

export type { AgentUse, AgentView, CollectionView, LineView, NodeAgent, NodeNeed, NodeView, RefusedFile, ViewProblem } from "./view.js";

/** Sent in the first frame of a socket, so a client built for another protocol can say so. */
export const PROTOCOL_VERSION = 1;

const requestId = z.string().min(1).describe("Chosen by the client; the answer carries it.");

export const collectionReadRequest = z.strictObject({ id: requestId, type: z.literal("collection.read") });

export const agentWriteRequest = z.strictObject({ id: requestId, type: z.literal("agent.write"), line: z.string(), agent: z.string(), prompt: z.string(), settings: z.record(z.string(), z.unknown()).optional(), version: z.string() });

export const extraWriteRequest = z.strictObject({ id: requestId, type: z.literal("extra.write"), line: z.string(), agent: z.string(), text: z.string(), version: z.string() });

export const fixtureWriteRequest = z.strictObject({ id: requestId, type: z.literal("fixture.write"), line: z.string(), node: z.string(), needs: z.record(z.string(), z.string()) });

export const fixtureReadRequest = z.strictObject({ id: requestId, type: z.literal("fixture.read"), line: z.string(), node: z.string() });

export const runPreviewRequest = z.strictObject({ id: requestId, type: z.literal("run.preview"), line: z.string(), node: z.string(), fixture: z.record(z.string(), z.string()), folder: z.string(), permission: z.enum(["acceptEdits", "bypass"]) });

export const runStartRequest = z.strictObject({ id: requestId, type: z.literal("run.start"), line: z.string(), node: z.string(), fixture: z.record(z.string(), z.string()), folder: z.string(), permission: z.enum(["acceptEdits", "bypass"]) });

export const runCancelRequest = z.strictObject({ id: requestId, type: z.literal("run.cancel"), run: z.string() });

export const runReadRequest = z.strictObject({ id: requestId, type: z.literal("run.read"), run: z.string(), after: z.number().int().min(0) });

/** A new request type is one schema here and one handler in the backend's table. */
export const requestSchema = z.discriminatedUnion("type", [collectionReadRequest, agentWriteRequest, extraWriteRequest, fixtureWriteRequest, fixtureReadRequest, runPreviewRequest, runStartRequest, runCancelRequest, runReadRequest]);

export type Request = z.infer<typeof requestSchema>;
export type RequestKind = Request["type"];

export const REQUEST_TYPES: RequestKind[] = requestSchema.options.map(({ shape }) => shape.type.value);

/** What a request is answered with, in a `result` frame. */
export type ResultOf<Asked extends Request> = Asked extends { type: "collection.read" } ? CollectionView : Asked extends { type: "agent.write" | "extra.write" } ? { written: string } : Asked extends { type: "fixture.write" } ? { written: string } : Asked extends { type: "fixture.read" } ? { needs: Record<string, string> } : Asked extends { type: "run.preview" } ? RunPreview : Asked extends { type: "run.start" } ? { run: string } : Asked extends { type: "run.cancel" } ? { cancelled: string } : Asked extends { type: "run.read" } ? { lines: RunLine[]; ended?: { exitCode: number | null } } : never;

// Strict down to a node's agent; events, placeholders, needs, produces, edges, args, start and kind come from other packages and are only checked to be objects where required.
const presentObject = <Shape>() => z.custom<Shape>((value) => typeof value === "object" && value !== null);

const nodeAgentSchema = z.looseObject({ name: z.string(), file: z.string(), version: z.string().nullable(), prompt: z.string().nullable(), settings: z.record(z.string(), z.unknown()) });

const nodeViewSchema = z.looseObject({
  id: z.string(),
  station: z.string().optional(),
  fanout: z.looseObject({ over: z.string(), to: z.string() }).optional(),
  kind: z.custom<StationKind>().optional(),
  description: z.string().optional(),
  outcomes: z.array(z.string()),
  needs: z.array(presentObject<NodeNeed>()),
  produces: z.array(presentObject<NodeProduce>()),
  agentDefinition: z.string().optional(),
  events: presentObject<NodeEvents>(),
  agent: nodeAgentSchema.optional(),
  placeholders: z.custom<PromptPlaceholders>().optional(),
  extra: z.looseObject({ file: z.string(), text: z.string(), version: z.string() }).optional(),
});

const viewProblemSchema = z.looseObject({ rule: z.string(), node: z.string().optional(), message: z.string() });

const lineViewSchema = z.looseObject({
  id: z.string(),
  file: z.string(),
  entry: z.string(),
  exit: z.string(),
  fail: z.string().optional(),
  start: z.custom<LineStart>().optional(),
  args: z.record(z.string(), z.custom<LineArgSpec>()),
  nodes: z.array(nodeViewSchema),
  edges: z.array(z.custom<LineEdge>()),
  problems: z.array(viewProblemSchema),
});

const agentViewSchema = z.looseObject({
  name: z.string(),
  file: z.string(),
  extraFile: z.string().optional(),
  source: z.enum(["collection-new", "replaced", "extended"]),
  settings: z.record(z.string(), z.unknown()),
  prompt: z.string().nullable(),
  usedBy: z.array(z.looseObject({ line: z.string(), node: z.string() })),
});

export const collectionViewSchema: z.ZodType<CollectionView> = z.looseObject({
  folder: z.string().optional(),
  skills: z.array(z.string()).optional(),
  environment: z.array(z.looseObject({ name: z.string(), files: z.array(z.string()) })).optional(),
  lines: z.array(lineViewSchema),
  agents: z.array(agentViewSchema),
  refused: z.array(z.looseObject({ path: z.string(), reason: z.string() })),
  counts: z.looseObject({ lines: z.number(), agents: z.number(), refused: z.number(), problems: z.number() }),
});

export const helloFrame = z.strictObject({ type: z.literal("hello"), version: z.number().int() });
export const resultFrame = z.strictObject({ id: requestId, type: z.literal("result"), result: z.unknown() });
export const refusedFrame = z.strictObject({ id: requestId.optional(), type: z.literal("refused"), reason: z.string() });
export const collectionFrame = z.strictObject({ type: z.literal("collection"), collection: collectionViewSchema });

export const runOutputFrame = z.strictObject({ type: z.literal("run.output"), run: z.string(), line: z.strictObject({ stream: z.enum(["stdout", "stderr"]), text: z.string() }) });
export const runEndedFrame = z.strictObject({ type: z.literal("run.ended"), run: z.string(),
  exitCode: z.number().nullable(),
  outcome: z.string().optional(),
  produced: z.array(z.strictObject({ name: z.string(), found: z.boolean() })).optional(),
  edge: z.strictObject({ from: z.string(), to: z.string(), on: z.string(), iterationMax: z.number().optional() }).optional(),
});

export const serverFrameSchema = z.discriminatedUnion("type", [helloFrame, resultFrame, refusedFrame, collectionFrame, runOutputFrame, runEndedFrame]);

export type ServerFrame = z.infer<typeof serverFrameSchema>;
