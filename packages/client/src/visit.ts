// The floor as one visit reaches it. The visit's id is bound here and taken by no method, so touching another visit is not something a caller can express — the floor refuses it with a 403, and this refuses it at the compiler.
import type { BlobRef, RecordKind, Report, StationRunRecordView } from "@re-cinq/floor-contracts";
import { blobsApi, conversationApi, type StoredBytes } from "./blobs.js";
import { briefOutcome, type BriefOutcome } from "./station-runs.js";
import { FloorProblem, problemOf } from "./problem.js";
import { asked, done, send, type Reachable } from "./send.js";
import type { VisitToken } from "./tokens.js";

const HTTP_NOT_IMPLEMENTED = 501;
const HTTP_FORBIDDEN = 403;

export interface VisitAccess {
  url: string;
  token: VisitToken;
  visitId: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export type GitCredentialOutcome =
  | { kind: "credential"; username: string; password: string }
  /** This floor was given no credential provider, so no visit may write to a repository. */
  | { kind: "unconfigured" }
  /** This visit declared no need for that repository, or only to read it. */
  | { kind: "ungranted" };

export interface AppendRecord {
  kind: Extract<RecordKind, "log" | "turn" | "llm_call">;
  body: unknown;
  occurredAt: Date;
}

export interface VisitClient {
  brief(): Promise<BriefOutcome>;
  /** One enveloped event from the subsystem's supervisor. */
  sink(event: unknown): Promise<void>;
  gitCredential(repo: string): Promise<GitCredentialOutcome>;
  append(records: AppendRecord[]): Promise<StationRunRecordView[]>;
  readBlob(hashOrUrl: string): Promise<StoredBytes | null>;
  storeBlob(bytes: Uint8Array, contentType?: string): Promise<BlobRef>;
  saveConversation(archive: Uint8Array): Promise<BlobRef>;
  restoreConversation(savedBy: string): Promise<Uint8Array | null>;
  /** The one thing a visit token may post to the queue. Its name, its visit and its dedupe key are not the caller's to choose. */
  report(reported: { report: Report; worker: string }): Promise<void>;
}

export function createVisitClient(access: VisitAccess): VisitClient {
  const floor: Reachable = { url: access.url.replace(/\/+$/, ""), token: access.token, fetchFn: access.fetchFn, timeoutMs: access.timeoutMs };
  const visitId = access.visitId;
  const blobs = blobsApi(floor);
  const conversation = conversationApi(floor);

  return {
    brief: () => briefOutcome(floor, visitId),
    sink: async (event) => {
      await done(floor, { method: "POST", path: `/station-runs/${visitId}/sink`, body: event });
    },
    gitCredential: (repo) => gitCredential(floor, visitId, repo),
    append: async (records) => {
      const written = await asked<{ items: StationRunRecordView[] }>(floor, { method: "POST", path: `/station-runs/${visitId}/records`, body: { records: records.map(onTheWire) } });

      return written?.items ?? [];
    },
    readBlob: (hashOrUrl) => (hashOrUrl.includes("://") ? blobs.atUrl(hashOrUrl) : blobs.get(hashOrUrl)),
    storeBlob: (bytes, contentType) => blobs.put(bytes, contentType),
    saveConversation: (archive) => conversation.save(visitId, archive),
    restoreConversation: (savedBy) => conversation.restore(savedBy),
    report: async (reported) => {
      await done(floor, {
        method: "POST",
        path: "/events",
        body: { name: "station_run.reported", payload: { visitId, worker: reported.worker, report: reported.report }, dedupeKey: `station_run.reported:${visitId}` },
      });
    },
  };
}

function onTheWire(record: AppendRecord): { kind: string; body: unknown; occurredAt: string } {
  return { kind: record.kind, body: record.body, occurredAt: record.occurredAt.toISOString() };
}

// The two refusals mean opposite things — the floor has no provider at all, or this visit was not given that repository — so the status is read rather than collapsed.
async function gitCredential(floor: Reachable, visitId: string, repo: string): Promise<GitCredentialOutcome> {
  const asking = { method: "POST", path: `/station-runs/${visitId}/git-credential`, body: { repo } } as const;
  const response = await send(floor, asking);

  if (response.status === HTTP_NOT_IMPLEMENTED) return { kind: "unconfigured" };
  if (response.status === HTTP_FORBIDDEN) return { kind: "ungranted" };
  if (!response.ok) throw new FloorProblem(await problemOf(response), asking);

  return { kind: "credential", ...((await response.json()) as { username: string; password: string }) };
}
