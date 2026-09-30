// Versioned definitions: lines, stations, agent definitions, schedules. Content-hashed; a version row never changes, so a reference to one is forever.

import type { Pool, PoolClient } from "pg";
import { definitionHash } from "@floor/assembly-lines";

/** A `migration` is a pipeline file that ran: its name, and the sha256 of what it held when it did. */
export type DefinitionKind = "line" | "station" | "agent_definition" | "schedule" | "migration";

export interface DefinitionRow<Body> {
  kind: DefinitionKind;
  id: string;
  hash: string;
  body: Body;
  archivedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface PutResult {
  hash: string;
  created: boolean;
}

export interface DefinitionsStoreDeps {
  connection: Pool | PoolClient;
}

export class DefinitionsStore {
  constructor(private readonly deps: DefinitionsStoreDeps) {}

  /** Idempotent on content: putting the same body twice returns the same hash, created:false the second time. What was put last is the latest, so putting a body the id held BEFORE a newer one brings that version to the front again (its created_at moves; the row and its hash do not), and that counts as created: the id's latest changed. */
  async put<Body>(kind: DefinitionKind, id: string, body: Body, createdBy?: string): Promise<PutResult> {
    const hash = definitionHash(body);
    const { rows } = await this.deps.connection.query(
      `insert into definitions (kind, id, hash, body, created_by)
       values ($1, $2, $3, $4::jsonb, $5)
       on conflict (kind, id, hash) do update set created_at = now(), archived_at = null
         where exists (
           select 1 from definitions newer
           where newer.kind = excluded.kind and newer.id = excluded.id
             and newer.archived_at is null and newer.created_at > definitions.created_at
         ) or definitions.archived_at is not null
       returning hash`,
      [kind, id, hash, JSON.stringify(body), createdBy ?? null],
    );

    return { hash, created: rows.length > 0 };
  }

  async latest<Body>(kind: DefinitionKind, id: string): Promise<DefinitionRow<Body> | null> {
    const { rows } = await this.deps.connection.query(
      `select * from definitions where kind = $1 and id = $2 and archived_at is null order by created_at desc limit 1`,
      [kind, id],
    );

    return rows[0] ? toRow(rows[0]) : null;
  }

  async byHash<Body>(kind: DefinitionKind, id: string, hash: string): Promise<DefinitionRow<Body> | null> {
    const { rows } = await this.deps.connection.query(
      `select * from definitions where kind = $1 and id = $2 and hash = $3`,
      [kind, id, hash],
    );

    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Looked up by hash alone, with no id: a visit records only the hash it resolved to (docs/assembly_run_storage.md's six tables have no station_id column), and a sha256 collision across two different ids of the same kind is not a real risk. */
  async byHashOnly<Body>(kind: DefinitionKind, hash: string): Promise<DefinitionRow<Body> | null> {
    const { rows } = await this.deps.connection.query(
      `select * from definitions where kind = $1 and hash = $2 limit 1`,
      [kind, hash],
    );

    return rows[0] ? toRow(rows[0]) : null;
  }

  /** The latest, non-archived version of every id of this kind, optionally narrowed to one id. */
  async listLatest<Body>(kind: DefinitionKind, id?: string): Promise<DefinitionRow<Body>[]> {
    const { rows } = await this.deps.connection.query(
      `select distinct on (id) * from definitions
       where kind = $1 and archived_at is null and ($2::text is null or id = $2)
       order by id, created_at desc`,
      [kind, id ?? null],
    );

    return rows.map((row) => toRow<Body>(row));
  }

  /** Lines whose latest, non-archived version declares this event under `start.on`; an older version that did starts nothing. */
  async linesStartedBy<Body>(eventName: string): Promise<DefinitionRow<Body>[]> {
    const { rows } = await this.deps.connection.query(
      `select * from (
         select distinct on (id) * from definitions
         where kind = 'line' and archived_at is null
         order by id, created_at desc
       ) latest
       where jsonb_exists(latest.body->'start'->'on', $1)`,
      [eventName],
    );

    return rows.map((row) => toRow<Body>(row));
  }

  async versions<Body>(kind: DefinitionKind, id: string): Promise<DefinitionRow<Body>[]> {
    const { rows } = await this.deps.connection.query(
      `select * from definitions where kind = $1 and id = $2 order by created_at desc`,
      [kind, id],
    );

    return rows.map((row) => toRow<Body>(row));
  }

  /** Archives every version of this id; existing references (a run's line_hash, a visit's station_hash) are untouched, since a version row never changes. */
  async archive(kind: DefinitionKind, id: string): Promise<void> {
    await this.deps.connection.query(
      `update definitions set archived_at = now() where kind = $1 and id = $2 and archived_at is null`,
      [kind, id],
    );
  }
}

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface DefinitionRowRaw {
  kind: DefinitionKind;
  id: string;
  hash: string;
  body: unknown;
  archived_at: Date | null;
  created_by: string | null;
  created_at: Date;
}
/* eslint-enable @typescript-eslint/naming-convention */

function toRow<Body>(row: DefinitionRowRaw): DefinitionRow<Body> {
  return {
    kind: row.kind,
    id: row.id,
    hash: row.hash,
    body: row.body as Body,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
