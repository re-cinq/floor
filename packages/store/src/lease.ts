// Advisory locks are session-scoped, so a lease holds a dedicated client for its whole lifetime.
import type { Pool, PoolClient } from "pg";

export interface Lease {
  release(): Promise<void>;
}

export async function acquireLease(pool: Pool, key: bigint): Promise<Lease | null> {
  const client = await pool.connect();

  const { rows } = await client.query("select pg_try_advisory_lock($1) as acquired", [key]);

  if (!rows[0].acquired) {
    client.release();

    return null;
  }

  return new AdvisoryLease(client, key);
}

class AdvisoryLease implements Lease {
  private released = false;

  constructor(
    private readonly client: PoolClient,
    private readonly key: bigint,
  ) {}

  async release(): Promise<void> {
    if (this.released) return;

    this.released = true;
    await this.client.query("select pg_advisory_unlock($1)", [this.key]);
    this.client.release();
  }
}
