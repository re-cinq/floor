// Versioned definitions: lines, stations, agent definitions, schedules. Content-hashed; a version row never changes, so a reference to one is forever.

import type { Pool, PoolClient } from "pg";
import { definitionHash } from "@floor/assembly-lines";

export type DefinitionKind = "line" | "station" | "agent_definition" | "schedule";

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

  /** Idempotent on content: putting the same body twice returns the same hash, created:false the second time. */
  async put<Body>(kind: DefinitionKind, id: string, body: Body, createdBy?: string): Promise<PutResult> {
    const hash = definitionHash(body);
    const { rows } = await this.deps.connection.query(
      `insert into definitions (kind, id, hash, body, created_by)
       values ($1, $2, $3, $4::jsonb, $5)
       on conflict (kind, id, hash) do nothing
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
