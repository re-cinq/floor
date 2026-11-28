// The clusters a floor drives, and what each holds of every agent definition. An agent definition is pushed, not fetched per visit: a new latest version queues one claimable event per cluster, and a cluster reports back what its kube really holds, so a version edited by hand in kube becomes the floor's own newest.

import type { Pool, PoolClient } from "pg";
import { definitionHash } from "@re-cinq/floor-assembly-lines";
import type { ModelCatalogStatus, SubsystemVersions } from "@re-cinq/floor-contracts";
import { CLUSTER_LIVE_MINUTES, presenceState, type AgentPresence } from "./agent-presence.js";
import { DefinitionsStore, type PutResult } from "./definitions.js";
import { EventStore } from "./events.js";
import { modelAvailability } from "./model-availability.js";
import type { OpenContext } from "./open-visit.js";
import { withTransaction } from "./rows.js";

const MS_PER_MINUTE = 60_000;

export const AGENT_DEFINITION_CHANGED = "agent_definition.changed";

/** The tag only one cluster's claims offer, so each cluster takes its own copy of a changed event. */
export function clusterTag(clusterId: string): string {
  return `cluster:${clusterId}`;
}

export interface ClusterHoldingRow {
  clusterId: string;
  hash: string;
  body: unknown;
  appliedAt: Date;
}

export interface RecordedHolding {
  hash: string;
  /** True when the body was no version the floor knew: an edit made in kube, now the agent's newest version. */
  adopted: boolean;
}

/** What a cluster agent says it runs when it registers; an older agent sends neither. */
export interface ClusterBuild {
  build?: string;
  subsystem?: SubsystemVersions | null;
  models?: ModelCatalogStatus | null;
}

export interface ClusterVersionsRow {
  id: string;
  build: string | null;
  subsystem: SubsystemVersions | null;
  models: ModelCatalogStatus | null;
  lastSeenAt: Date;
}

export interface ClusterStoreDeps {
  pool: Pool;
  now?: () => Date;
}

export class ClusterStore {
  constructor(private readonly deps: ClusterStoreDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Registers or refreshes a cluster, and queues every agent definition whose latest version it does not hold, unless one is already on its way. */
  async register(id: string, tags: string[], running: ClusterBuild = {}): Promise<void> {
    await withTransaction(this.deps.pool, async (client) => {
      await client.query(
        `insert into clusters (id, tags, last_seen_at, build, subsystem, models) values ($1, $2::text[], $3, $4, $5::jsonb, $6::jsonb)
         on conflict (id) do update set tags = excluded.tags, last_seen_at = excluded.last_seen_at, build = excluded.build, subsystem = excluded.subsystem, models = excluded.models`,
        [id, tags, this.now(), running.build ?? null, running.subsystem ? JSON.stringify(running.subsystem) : null, running.models ? JSON.stringify(running.models) : null],
      );
      await this.queueMissing(client, id);
    });
  }

  /** `DefinitionsStore.put` for an agent definition, with the new latest version queued to every cluster in the same transaction. */
  async putAgentDefinition(id: string, body: unknown, createdBy?: string): Promise<PutResult> {
    return withTransaction(this.deps.pool, (client) => this.putAndFanOut(client, id, body, createdBy));
  }

  /** What a cluster read back out of its kube. A body the floor never stored for this id is adopted as the newest version; an older stored one is only a cluster behind. */
  async recordHolding(clusterId: string, definitionId: string, body: unknown): Promise<RecordedHolding> {
    return withTransaction(this.deps.pool, async (client) => {
      const hash = definitionHash(body);
      const known = await new DefinitionsStore({ connection: client }).byHash("agent_definition", definitionId, hash);

      if (!known) await this.putAndFanOut(client, definitionId, body, clusterTag(clusterId));
      await client.query(
        `insert into cluster_agent_definitions (cluster_id, definition_id, hash, body, applied_at)
         values ($1, $2, $3, $4::jsonb, $5)
         on conflict (cluster_id, definition_id) do update set hash = excluded.hash, body = excluded.body, applied_at = excluded.applied_at`,
        [clusterId, definitionId, hash, JSON.stringify(body), this.now()],
      );

      return { hash, adopted: !known };
    });
  }

  async holdings(definitionId: string): Promise<ClusterHoldingRow[]> {
    const { rows } = await this.deps.pool.query(
      `select cluster_id, hash, body, applied_at from cluster_agent_definitions where definition_id = $1 order by cluster_id`,
      [definitionId],
    );

    return rows.map((row) => ({ clusterId: row.cluster_id, hash: row.hash, body: row.body, appliedAt: row.applied_at }));
  }

  /** The clusters seen within CLUSTER_LIVE_MINUTES, with what each last said it runs. */
  async liveVersions(): Promise<ClusterVersionsRow[]> {
    const liveSince = new Date(this.now().getTime() - CLUSTER_LIVE_MINUTES * MS_PER_MINUTE);
    const { rows } = await this.deps.pool.query(`select id, build, subsystem, models, last_seen_at from clusters where last_seen_at >= $1 order by id`, [liveSince]);

    return rows.map((row) => ({ id: row.id, build: row.build, subsystem: row.subsystem, models: row.models, lastSeenAt: row.last_seen_at }));
  }

  /** Every agent definition's presence on the live clusters, by id. */
  async presence(): Promise<Record<string, AgentPresence>> {
    const [latest, clusters, holdings] = await Promise.all([
      new DefinitionsStore({ connection: this.deps.pool }).listLatest<{ settings?: { model?: string } }>("agent_definition"),
      this.deps.pool.query(`select id, last_seen_at, models from clusters order by id`),
      this.deps.pool.query(`select cluster_id, definition_id, hash from cluster_agent_definitions`),
    ]);
    const { rows: heldRows } = holdings;
    const { rows: clusterRows } = clusters;
    const seen = clusterRows.map((row) => ({ id: row.id as string, lastSeenAt: row.last_seen_at as Date }));
    const liveSince = this.now().getTime() - CLUSTER_LIVE_MINUTES * MS_PER_MINUTE;
    const liveCatalogs = clusterRows.filter((row) => (row.last_seen_at as Date).getTime() >= liveSince).map((row) => row.models as ModelCatalogStatus | null);

    return Object.fromEntries(
      latest.map(({ id, hash, body }) => [
        id,
        {
          ...presenceState({
          latest: hash,
          clusters: seen,
          holdings: heldRows
            .filter((row) => row.definition_id === id)
            .map((row) => ({ clusterId: row.cluster_id as string, hash: row.hash as string })),
          now: this.now(),
          }),
          modelAvailable: body.settings?.model ? modelAvailability(body.settings.model, liveCatalogs) : "unverified",
        },
      ]),
    );
  }

  private async putAndFanOut(client: PoolClient, id: string, body: unknown, createdBy?: string): Promise<PutResult> {
    const put = await new DefinitionsStore({ connection: client }).put("agent_definition", id, body, createdBy);

    if (!put.created) return put;
    const { rows } = await client.query(`select id from clusters order by id`);
    const events = new EventStore({ connection: client, now: this.deps.now });

    for (const cluster of rows) {
      await events.enqueue({ name: AGENT_DEFINITION_CHANGED, payload: { id, hash: put.hash }, tags: [clusterTag(cluster.id)] });
    }

    return put;
  }

  private async queueMissing(client: PoolClient, clusterId: string): Promise<void> {
    const { rows } = await client.query(
      `select latest.id, latest.hash from (
         select distinct on (id) id, hash from definitions
         where kind = 'agent_definition' and archived_at is null
         order by id, created_at desc
       ) latest
       left join cluster_agent_definitions held on held.cluster_id = $1 and held.definition_id = latest.id
       where held.hash is distinct from latest.hash
         and not exists (
           select 1 from events
           where name = $2 and tags = array[$3]::text[] and payload->>'id' = latest.id
             and acked_at is null and dead_at is null and dropped_at is null
         )
       order by latest.id`,
      [clusterId, AGENT_DEFINITION_CHANGED, clusterTag(clusterId)],
    );
    const events = new EventStore({ connection: client, now: this.deps.now });

    for (const row of rows) {
      await events.enqueue({ name: AGENT_DEFINITION_CHANGED, payload: { id: row.id, hash: row.hash }, tags: [clusterTag(clusterId)] });
    }
  }
}

/** The refusal for an agent naming a model no live cluster's catalog lists, or null when some cluster can run it or none can say. */
export async function unrunnableModelError(client: PoolClient, context: OpenContext, now: Date): Promise<string | null> {
  const model = context.agentSettings?.model;

  if (!model) return null;
  const liveSince = new Date(now.getTime() - CLUSTER_LIVE_MINUTES * MS_PER_MINUTE);
  const { rows } = await client.query<{ models: ModelCatalogStatus | null }>(`select models from clusters where last_seen_at >= $1 and tags @> $2::text[]`, [liveSince, context.dispatchTags]);

  return unrunnableModelMessage(context.agentId, model, rows.map((row) => row.models));
}

function unrunnableModelMessage(agentId: string | null, model: string, catalogs: (ModelCatalogStatus | null)[]): string | null {
  if (modelAvailability(model, catalogs) !== false) return null;
  const refreshedAt = catalogs.map((catalog) => catalog?.refreshedAt ?? "").sort().at(-1);

  return `agent ${agentId} names model ${model}, which no cluster can run (catalog refreshed ${refreshedAt})`;
}
