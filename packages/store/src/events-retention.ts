// What the queue forgets (docs/assembly_run_storage.md, "Retention"): the events of a run that settled long enough ago.

import type { Pool, PoolClient } from "pg";

const RETENTION_DAYS = 30;
const MS_PER_DAY = 86_400_000;
export const EVENT_RETENTION_MS = RETENTION_DAYS * MS_PER_DAY;

// Age is the run settling, never the event's; internal.* is the audit log; an event of no run, or of a run not held, stays (docs/assembly_run_storage.md, "Retention").
export async function reapSettledRunEvents(connection: Pool | PoolClient, settledBefore: Date): Promise<number> {
  const { rowCount } = await connection.query(
    `delete from events using assembly_runs
     where events.run_id = assembly_runs.id
       and assembly_runs.finished_at < $1
       and events.name not like 'internal.%'`,
    [settledBefore],
  );

  return rowCount ?? 0;
}
