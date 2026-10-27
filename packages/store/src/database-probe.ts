// Can this process reach its database right now? Asked on a connection of its own, so the answer never waits in the line of requests that share the pool.
import postgres from "pg";
import { createPool } from "./pg.js";

export const PROBE_TIMEOUT_MS = 2000;

export class DatabaseProbe {
  private readonly pool: postgres.Pool;

  constructor(connectionString: string, timeoutMs: number = PROBE_TIMEOUT_MS) {
    this.pool = createPool(connectionString, { max: 1, connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs });
    // A connection that drops while idle is reported to the pool; unheard, node takes the whole process down. The next probe finds out the same thing by asking.
    this.pool.on("error", () => undefined);
  }

  async reachable(): Promise<boolean> {
    try {
      await this.pool.query("select 1");

      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
