// A floor, as a service reaches it. The namespaces are the floor's own route files, one for one.
import type { AgentDefinitionBody, AgentPresence, AgentRecipes, ClusterHolding, LineBody, MigrationBody, PutResult, ScheduleBody, StationBody, DefinitionRowView, FloorEventView } from "@re-cinq/floor-contracts";
import { blobsApi, conversationApi, type BlobsApi, type ConversationApi } from "./blobs.js";
import { definitionApi, type DefinitionApi } from "./definitions.js";
import { eventsApi, type EventsApi } from "./events.js";
import { costsApi, runsApi, type CostsRowsApi, type RunsApi, type StartRun, type StartedRun } from "./runs.js";
import { asked, done, reach, type Reachable } from "./send.js";
import { stationRunsApi, type StationRunsApi } from "./station-runs.js";
import type { SocketFn } from "./live.js";
import type { ServiceToken } from "./tokens.js";

const HTTP_NOT_FOUND = 404;

export interface FloorAccess {
  url: string;
  token: ServiceToken;
  /** The seam a test injects for HTTP. */
  fetchFn?: typeof fetch;
  /** The seam a test injects for the live socket. */
  socketFn?: SocketFn;
  timeoutMs?: number;
}

export interface LinesApi extends DefinitionApi<LineBody> {
  /** Answers the run already open on this subject, joined, rather than opening a second one. */
  start(lineId: string, starting: StartRun): Promise<StartedRun>;
}

export interface AgentDefinitionsApi extends DefinitionApi<AgentDefinitionBody> {
  /** Every agent definition's presence on the clusters, by id. */
  presence(): Promise<Record<string, AgentPresence>>;
  /** What each cluster read back out of its kube for this agent definition. */
  clusters(id: string): Promise<ClusterHolding<AgentDefinitionBody>[]>;
  /** Null when nothing of that id is there. */
  recipes(id: string): Promise<AgentRecipes<AgentDefinitionBody> | null>;
}

export interface ClustersApi {
  /** Registers this cluster, or tells the floor it is still there. */
  register(id: string, tags: string[]): Promise<void>;
}

export interface SchedulesApi extends DefinitionApi<ScheduleBody> {
  /** Posts this schedule's event now, without waiting for its cron. */
  trigger(id: string): Promise<FloorEventView | null>;
}

export interface MigrationsApi {
  list(): Promise<DefinitionRowView<MigrationBody>[]>;
  get(name: string): Promise<DefinitionRowView<MigrationBody> | null>;
  /** Refused with a 409 when that name already ran with different content. */
  put(name: string, sha256: string): Promise<PutResult>;
}

export interface Version {
  sha: string;
  schemaVersion: number;
  /** Every replica serves; only the one holding the floor's lease runs its loop. */
  runsLoop: boolean;
}

export interface HealthApi {
  live(): Promise<boolean>;
  ready(): Promise<boolean>;
  version(): Promise<Version>;
}

export interface FloorClient {
  readonly health: HealthApi;
  readonly lines: LinesApi;
  readonly stations: DefinitionApi<StationBody>;
  readonly agentDefinitions: AgentDefinitionsApi;
  readonly clusters: ClustersApi;
  readonly schedules: SchedulesApi;
  readonly migrations: MigrationsApi;
  readonly runs: RunsApi;
  readonly stationRuns: StationRunsApi;
  readonly events: EventsApi;
  readonly blobs: BlobsApi;
  readonly conversations: ConversationApi;
  readonly costs: CostsRowsApi;
}

export function createFloorClient(access: FloorAccess): FloorClient {
  const floor: Reachable & { socketFn?: SocketFn } = { ...reach(access.url, access.token, { fetchFn: access.fetchFn, timeoutMs: access.timeoutMs }), socketFn: access.socketFn };

  return {
    health: healthApi(floor),
    lines: { ...definitionApi<LineBody>(floor, "assembly-lines"), start: (lineId, starting) => startRun(floor, lineId, starting) },
    stations: definitionApi<StationBody>(floor, "stations"),
    agentDefinitions: agentDefinitionsApi(floor),
    clusters: {
      register: async (id, tags) => {
        await done(floor, { method: "PUT", path: `/clusters/${id}`, body: { tags } });
      },
    },
    schedules: { ...definitionApi<ScheduleBody>(floor, "schedules"), trigger: (id) => asked<FloorEventView>(floor, { method: "POST", path: `/schedules/${id}/trigger` }, [HTTP_NOT_FOUND]) },
    migrations: migrationsApi(floor),
    runs: runsApi(floor),
    stationRuns: stationRunsApi(floor),
    events: eventsApi(floor),
    blobs: blobsApi(floor),
    conversations: conversationApi(floor),
    costs: costsApi(floor),
  };
}

async function startRun(floor: Reachable, lineId: string, starting: StartRun): Promise<StartedRun> {
  return (await asked<StartedRun>(floor, { method: "POST", path: `/assembly-lines/${lineId}/start`, body: starting }))!;
}

function migrationsApi(floor: Reachable): MigrationsApi {
  const rows = definitionApi<MigrationBody>(floor, "migrations");

  return {
    list: () => rows.list(),
    get: (name) => rows.get(name),
    put: (name, sha256) => rows.put(name, { sha256 }),
  };
}

// Health is unauthenticated, so a probe answers rather than throwing when the floor is not up yet.
function healthApi(floor: Reachable): HealthApi {
  const answers = async (path: string): Promise<boolean> => {
    try {
      return (await asked<{ status: string }>(floor, { method: "GET", path })) !== null;
    } catch {
      return false;
    }
  };

  return {
    live: () => answers("/healthz"),
    ready: () => answers("/readyz"),
    version: async () => (await asked<Version>(floor, { method: "GET", path: "/version" }))!,
  };
}

function agentDefinitionsApi(floor: Reachable): AgentDefinitionsApi {
  return {
    ...definitionApi<AgentDefinitionBody>(floor, "agent-definitions"),
    presence: async () => (await asked<Record<string, AgentPresence>>(floor, { method: "GET", path: "/agent-definitions/presence" })) ?? {},
    clusters: async (id) => (await asked<{ items: ClusterHolding<AgentDefinitionBody>[] }>(floor, { method: "GET", path: `/agent-definitions/${id}/clusters` }))?.items ?? [],
    recipes: (id) => asked<AgentRecipes<AgentDefinitionBody>>(floor, { method: "GET", path: `/agent-definitions/${id}/recipes` }, [HTTP_NOT_FOUND]),
  };
}
