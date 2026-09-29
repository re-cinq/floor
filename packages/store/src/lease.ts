// Advisory locks are session-scoped, so a lease holds a dedicated client for its whole lifetime.
import type { Pool, PoolClient } from "pg";

export interface Lease {
  /** False once released, or once the connection holding the lock is gone: Postgres drops the lock with the session, and tells nobody. */
  isHeld(): Promise<boolean>;
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

/** Blocks until the lock is free, so a second caller waits for the first and then finds nothing left to do. */
export async function withAdvisoryLock<T>(pool: Pool, key: bigint, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [key]);

    try {
      return await work(client);
    } finally {
      await client.query("select pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

class AdvisoryLease implements Lease {
  private gone = false;

  constructor(
    private readonly client: PoolClient,
    private readonly key: bigint,
  ) {
    client.on("error", this.lose);
  }

  // The connection is dead, so it is destroyed rather than handed back to the pool for someone else to trip over.
  private readonly lose = (): void => {
    if (this.gone) return;

    this.gone = true;
    this.client.off("error", this.lose);
    this.client.release(new Error("the lease's connection is gone"));
  };

  async isHeld(): Promise<boolean> {
    if (this.gone) return false;

    try {
      await this.client.query("select 1");

      return true;
    } catch {
      this.lose();

      return false;
    }
  }

  async release(): Promise<void> {
    if (this.gone) return;

    this.gone = true;
    this.client.off("error", this.lose);
    await this.client.query("select pg_advisory_unlock($1)", [this.key]);
    this.client.release();
  }
}
