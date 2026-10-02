// All a station author sees (docs/assembly_run_storage.md, "The station contract"): a brief in, a report out, and four tools.

export interface Brief {
  visitId: string;
  /** The assembly run this visit belongs to: what to key on, so a retried visit finds what the first one stored. */
  runId: string;
  /** The assembly line that run walks. */
  lineId: string;
  iteration: number;
  /** Each need by name: a value as its text, a file as the address `tools.read` fetches, a repo as `url@ref`. */
  needs: Record<string, string>;
}

export interface Report {
  /** One of the outcomes the station declares. */
  outcome: string;
  /** The values the station produces, by name. A file is produced with `tools.produce`, not here. */
  produced?: Record<string, string>;
  error?: string;
}

export interface ModelCall {
  costUsd?: number;
  model?: string;
  usage?: unknown;
}

export interface Tools {
  /** The bytes of a file need. */
  read(need: string): Promise<Buffer>;
  /** A file the station produces: stored with the floor, and named in the report. */
  produce(name: string, bytes: Buffer | string): Promise<void>;
  /** A model call the station made, so the floor's costs count it. */
  modelCall(call: ModelCall): Promise<void>;
  /** Aborted when the visit's deadline passes: work past it is work nobody will read. */
  signal: AbortSignal;
}

export type Handle = (brief: Brief, tools: Tools) => Promise<Report>;

export interface StationOptions {
  /** `FLOOR_API_URL` when absent. */
  floorUrl?: string;
  /** `FLOOR_SERVICE_TOKEN` when absent. */
  token?: string;
  /** How many visits to take from the queue at once; they are worked one after another. */
  claimLimit?: number;
  /** How long to rest after finding nothing. */
  idleMs?: number;
  /** False leaves the loop to the caller, who calls `once`. */
  start?: boolean;
  /** Told of what the loop survives: a floor out of reach, a report it could not post. */
  onError?: (error: unknown) => void;
}

export interface RunningStation {
  /** One pass over the queue; the number of events it took. */
  once(): Promise<number>;
  /** Lets the visit in hand finish, then stops. */
  stop(): Promise<void>;
}
