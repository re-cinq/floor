// Three routes refuse a request that narrows nothing. OneOf makes that a compile error rather than a 400.

/** At least one of these, and any of the rest beside it. */
export type OneOf<Fields> = {
  [Named in keyof Fields]-?: Required<Pick<Fields, Named>> & Partial<Omit<Fields, Named>>;
}[keyof Fields];

/** `withoutRepo` asks for the runs that belong to no repository; a floor refuses it together with `repo`. */
export type RunFilter = OneOf<{ line: string; repo: string; withoutRepo: true; subject: string; open: boolean; since: string }>;

export type EventFilter = OneOf<{ since: string; name: string; run: string; stationRun: string }>;

export type CostsFilter = OneOf<{ run: string; repo: string; line: string; station: string; since: string; until: string }>;

export type CostsGroupBy = "day" | "line" | "station" | "model" | "run";
