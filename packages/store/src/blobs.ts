// Content-addressed bytes behind every `file` item (docs/api_sketch.md, "Blobs"): a Postgres bytea store, sha256 the primary key.

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { enforce } from "./refusal.js";

const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const BYTES_PER_MIB = KIB_PER_MIB * BYTES_PER_KIB;
const MAX_BLOB_MIB = 64;
const MAX_ARCHIVE_MIB = 256;
export const MAX_BLOB_BYTES = MAX_BLOB_MIB * BYTES_PER_MIB;
export const MAX_ARCHIVE_BYTES = MAX_ARCHIVE_MIB * BYTES_PER_MIB;

export interface Blob {
  hash: string;
  bytes: Buffer;
  size: number;
  contentType: string | null;
  createdAt: Date;
}

export interface BlobsStoreDeps {
  connection: Pool | PoolClient;
}

export class BlobsStore {
  constructor(private readonly deps: BlobsStoreDeps) {}

  /** Idempotent on content: the same bytes always hash the same, so a repeated write is a no-op. Rejects over the size cap rather than truncating. */
  async put(bytes: Buffer, contentType?: string): Promise<{ hash: string; size: number }> {
    enforce(bytes.length <= MAX_BLOB_BYTES, `blob of ${bytes.length} bytes exceeds the ${MAX_BLOB_BYTES}-byte cap`);

    return this.store(bytes, contentType);
  }

  /** A conversation archive: a blob like any other, under its own, larger cap. */
  async putArchive(bytes: Buffer): Promise<{ hash: string; size: number }> {
    enforce(bytes.length <= MAX_ARCHIVE_BYTES, `archive of ${bytes.length} bytes exceeds the ${MAX_ARCHIVE_BYTES}-byte cap`);

    return this.store(bytes, "application/gzip");
  }

  private async store(bytes: Buffer, contentType?: string): Promise<{ hash: string; size: number }> {
    const hash = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

    await this.deps.connection.query(
      `insert into blobs (hash, bytes, size, content_type) values ($1, $2, $3, $4) on conflict (hash) do nothing`,
      [hash, bytes, bytes.length, contentType ?? null],
    );

    return { hash, size: bytes.length };
  }

  async get(hash: string): Promise<Blob | null> {
    const { rows } = await this.deps.connection.query(`select * from blobs where hash = $1`, [hash]);

    return rows[0] ? toBlob(rows[0]) : null;
  }

  /** Deletes every blob nothing names, stored before `storedBefore`. The age is what protects a visit still running: what it has uploaded is named by nothing until it reports, and it reports before its deadline. */
  async reapUnreferenced(storedBefore: Date): Promise<string[]> {
    const { rows } = await this.deps.connection.query(
      `with named as (
         select value ->> 'ref' as hash from assembly_runs, jsonb_each(start_items) as item(key, value)
         union
         select value #>> '{}' from station_runs, jsonb_each(coalesce(report -> 'produced', '{}'::jsonb)) as produced(key, value)
         union
         select session_ref from station_runs
         union
         select body ->> 'ref' from station_run_records where kind in ('produced', 'session')
         union
         select value from definitions, jsonb_each_text(coalesce(body -> 'files', '{}'::jsonb)) as file(key, value) where kind = 'line'
       )
       delete from blobs
       where created_at < $1 and not exists (select 1 from named where named.hash = blobs.hash)
       returning hash`,
      [storedBefore],
    );

    return rows.map((row: { hash: string }) => row.hash);
  }
}

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface BlobRowRaw {
  hash: string;
  bytes: Buffer;
  size: string;
  content_type: string | null;
  created_at: Date;
}
/* eslint-enable @typescript-eslint/naming-convention */

function toBlob(row: BlobRowRaw): Blob {
  return { hash: row.hash, bytes: row.bytes, size: Number(row.size), contentType: row.content_type, createdAt: row.created_at };
}
