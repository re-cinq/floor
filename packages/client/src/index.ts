// eslint-disable-next-line re-lint/max-comment-lines -- Published as the client SDK introduction.
/**
 * Use the Client SDK to connect a service or executor to Floor. A service starts
 * [assembly runs](/floor/concepts/assembly-run/), reads their [bags](/floor/concepts/bag/),
 * and follows changes over a live connection. An executor uses a visit token to work
 * on the single visit assigned to it.
 *
 * @packageDocumentation
 */
export { createFloorClient } from "./client.js";
export { createVisitClient } from "./visit.js";
export { serviceToken, visitToken } from "./tokens.js";
export { FloorProblem, isFloorProblem } from "./problem.js";
export { reach, asked, send } from "./send.js";
export { CLOSE, watchRun } from "./live.js";
export { watchFloor } from "./floor-live.js";

export type { AgentDefinitionsApi, ClustersApi, FloorAccess, FloorClient, HealthApi, LinesApi, MigrationsApi, SchedulesApi, Version } from "./client.js";
export type { AppendRecord, GitCredentialOutcome, VisitAccess, VisitClient } from "./visit.js";
export type { ServiceToken, VisitToken } from "./tokens.js";
export type { Asking, Reachable } from "./send.js";
export type { BlobsApi, ConversationApi, StoredBytes } from "./blobs.js";
export type { DefinitionApi } from "./definitions.js";
export type { EnqueueEvent, EventsApi, EventsPage } from "./events.js";
export type { CostsFilter, CostsGroupBy, EventFilter, OneOf, RunFilter } from "./filters.js";
export type { CostsRowsApi, RunPage, RunsApi, StartRun, StartedRun } from "./runs.js";
export type { BriefOutcome, RecordsPage, StationRunsApi } from "./station-runs.js";
export type { FloorWatch, FloorWatchOptions } from "./floor-live.js";
export type { LiveSocket, RefusalCode, RunWatch, SocketFn, WatchEnd, WatchOptions } from "./live.js";

export type * from "@re-cinq/floor-contracts";
