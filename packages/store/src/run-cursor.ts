// The cursor of a run list: where the last run on a page stands in the list's order, `(created_at, id)`, as one string a client hands back unchanged.
import { enforce } from "./refusal.js";

export interface RunPosition {
  /** Postgres's own text for created_at, microseconds and offset included: a JS Date holds milliseconds and would move a run across the page boundary. */
  createdAt: string;
  id: string;
}

const CREATED_AT = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d{1,6})?[+-]\d\d(:\d\d)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeRunCursor(position: RunPosition): string {
  return Buffer.from(`${position.createdAt}_${position.id}`).toString("base64url");
}

export function decodeRunCursor(cursor: string): RunPosition {
  const parts = Buffer.from(cursor, "base64url").toString().split("_");
  const [createdAt = "", id = ""] = parts;

  enforce(parts.length === 2 && CREATED_AT.test(createdAt) && UUID.test(id), "malformed cursor");

  return { createdAt, id };
}
