// Every frame between a client and the backend. No Node import here: a browser bundle takes this file, and the types of `view.ts`, which are erased.
import { z } from "zod";
import type { CollectionView } from "./view.js";

export type { AgentUse, AgentView, CollectionView, LineView, NodeAgent, NodeNeed, NodeView, RefusedFile, ViewProblem } from "./view.js";

/** Sent in the first frame of a socket, so a client built for another protocol can say so. */
export const PROTOCOL_VERSION = 1;

const requestId = z.string().min(1).describe("Chosen by the client; the answer carries it.");

export const collectionReadRequest = z.strictObject({ id: requestId, type: z.literal("collection.read") });

/** A new request type is one schema here and one handler in the backend's table. */
export const requestSchema = z.discriminatedUnion("type", [collectionReadRequest]);

export type Request = z.infer<typeof requestSchema>;
export type RequestKind = Request["type"];

export const REQUEST_TYPES: RequestKind[] = requestSchema.options.map(({ shape }) => shape.type.value);

/** What a request is answered with, in a `result` frame. */
export type ResultOf<Asked extends Request> = Asked extends { type: "collection.read" } ? CollectionView : never;

function isCollectionView(held: unknown): held is CollectionView {
  return typeof held === "object" && held !== null && "lines" in held && Array.isArray(held.lines);
}

export const helloFrame = z.strictObject({ type: z.literal("hello"), version: z.number().int() });
export const resultFrame = z.strictObject({ id: requestId, type: z.literal("result"), result: z.unknown() });
export const refusedFrame = z.strictObject({ id: requestId.optional(), type: z.literal("refused"), reason: z.string() });
export const collectionFrame = z.strictObject({ type: z.literal("collection"), collection: z.custom<CollectionView>(isCollectionView) });

export const serverFrameSchema = z.discriminatedUnion("type", [helloFrame, resultFrame, refusedFrame, collectionFrame]);

export type ServerFrame = z.infer<typeof serverFrameSchema>;
