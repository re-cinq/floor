// A request in, one frame out. Adding a request type is its schema in the protocol and its handler in `HANDLERS`.
import { REQUEST_TYPES, requestSchema, type Request, type RequestKind, type ResultOf, type ServerFrame } from "../protocol.js";
import { z } from "zod";
import type { CollectionView } from "../view.js";

export interface StudioContext {
  readCollection(): Promise<CollectionView>;
}

interface Handler<Asked extends Request> {
  type: Asked["type"];
  handle(context: StudioContext, request: Asked): Promise<ResultOf<Asked>>;
}

type CollectionRead = Extract<Request, { type: "collection.read" }>;

const collectionRead: Handler<CollectionRead> = { type: "collection.read", handle: (context) => context.readCollection() };

/** One handler for each request type: a test holds the list to `REQUEST_TYPES`. */
export const HANDLERS: Handler<CollectionRead>[] = [collectionRead];

export async function answerFrame(text: string, context: StudioContext): Promise<ServerFrame> {
  const held = parsedJson(text);
  const id = idOf(held);
  const parsed = requestSchema.safeParse(held);

  if (!parsed.success) return { ...(id && { id }), type: "refused", reason: refusalOf(held, parsed.error) };

  return handled(parsed.data, context);
}

async function handled(request: Request, context: StudioContext): Promise<ServerFrame> {
  const handler = new Map(HANDLERS.map((each) => [each.type, each])).get(request.type);

  if (!handler) return { id: request.id, type: "refused", reason: `no handler for ${request.type}` };

  return handler.handle(context, request).then(
    (result): ServerFrame => ({ id: request.id, type: "result", result }),
    (cause: unknown): ServerFrame => ({ id: request.id, type: "refused", reason: cause instanceof Error ? cause.message : String(cause) }),
  );
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

const NOT_JSON = Symbol("not json");

function idOf(held: unknown): string | undefined {
  const id = typeof held === "object" && held !== null && "id" in held ? held.id : undefined;

  return typeof id === "string" && id !== "" ? id : undefined;
}

function refusalOf(held: unknown, error: z.ZodError): string {
  if (held === NOT_JSON) return "the frame is not JSON";
  const type = typeof held === "object" && held !== null && "type" in held ? held.type : undefined;

  return REQUEST_TYPES.includes(type as RequestKind) ? z.prettifyError(error) : `unknown request type ${JSON.stringify(type)}; known: ${REQUEST_TYPES.join(", ")}`;
}
