// The sink (docs/assembly_run_storage.md, "The agent kind runs on the ai-agent-subsystem"): each event the pod's supervisor posts becomes a record, and the one that ends the visit becomes its report.
import { readAgentVerdict } from "@floor/assembly-lines";
import { enforce, type RecordKind, type Report, type StationBody, type Visit } from "@floor/store";
import type { Deps } from "../deps.js";
import { pricedBy } from "./pricing.js";
import { peel, readSinkEvent, spokenIn, type SinkEvent } from "./sink-event.js";

const MAX_ERROR_CHARS = 300;
const MAX_NOTES = 200;

type SinkDeps = Pick<Deps, "runs" | "records" | "blobs" | "events" | "definitions" | "now">;
type Ended = Extract<SinkEvent, { kind: "ended" }>;

interface ResultNote {
  text: string;
  failed: boolean;
}

export class Sink {
  constructor(private readonly deps: SinkDeps) {}

  async take(visitId: string, body: unknown): Promise<SinkEvent> {
    const visit = await this.deps.runs.visit(visitId);

    enforce(visit, `no visit "${visitId}"`);
    enforce(!visit.report, `visit "${visitId}" is already done`);
    const event = readSinkEvent(body);

    await this.note(visit, event, peel(body));
    if (event.kind === "ended") await this.postReport(visit, event);

    return event;
  }

  private async note(visit: Visit, event: SinkEvent, payload: unknown): Promise<void> {
    await this.append(visit.id, recordKindOf(event), noteOf(visit, event, payload));
    if (event.kind !== "file" || !event.ref) return;

    if (await this.deps.blobs.get(event.ref)) await this.append(visit.id, "produced", { name: event.name, ref: event.ref });
  }

  private async append(visitId: string, kind: RecordKind, body: unknown): Promise<void> {
    await this.deps.records.append(visitId, [{ kind, body, occurredAt: this.deps.now() }]);
  }

  // Deduplicated on the visit: the supervisor retries a post it thinks was lost, and a visit reports once.
  private async postReport(visit: Visit, ended: Ended): Promise<void> {
    const report = await this.reportOf(visit, ended);

    await this.deps.events.enqueue({
      name: "station_run.reported",
      payload: { visitId: visit.id, report },
      dedupeKey: `station_run.reported:${visit.id}`,
      runId: visit.runId,
    });
  }

  private async reportOf(visit: Visit, ended: Ended): Promise<Report> {
    const result = await this.resultOf(visit.id);
    const failed = ended.failed || Boolean(result?.failed);
    const report = failed ? { outcome: "failed", error: failureOf(ended, result) } : await this.verdictOf(visit, result?.text ?? "");

    return withSession(report, await this.sessionOf(visit.id));
  }

  private async verdictOf(visit: Visit, said: string): Promise<Report> {
    const station = await this.deps.definitions.byHashOnly<StationBody>("station", visit.stationHash ?? "");

    enforce(station, `visit "${visit.id}" has no station to read outcomes from`);
    const verdict = readAgentVerdict(said, station.body.outcomes);
    const produced = { ...declaredValues(station.body, verdict.produced), ...(await this.allFilesOf(visit.id, station.body, said)) };

    return { outcome: verdict.outcome, produced, error: verdict.error };
  }

  private async allFilesOf(visitId: string, station: StationBody, said: string): Promise<Record<string, string>> {
    const uploaded = await this.filesOf(visitId, station);
    const spoken = await this.outputsOf(station, said);

    return { ...uploaded, ...spoken };
  }

  private async resultOf(visitId: string): Promise<ResultNote | null> {
    const latest = await this.deps.records.latest(visitId, "llm_call");

    if (!latest) return null;
    const note = latest.body as ResultNote;

    return note.text ? note : { ...note, text: spokenIn(await this.turnsOf(visitId)) };
  }

  // Every turn the visit recorded, a page after a page: how many there are is known only when one comes back short.
  private async turnsOf(visitId: string, after = 0): Promise<unknown[]> {
    const page = await this.deps.records.list(visitId, "turn", { limit: MAX_NOTES, after });
    const turns = page.items.map((record) => record.body);

    return page.nextCursor === null ? turns : [...turns, ...(await this.turnsOf(visitId, page.nextCursor))];
  }

  private async sessionOf(visitId: string): Promise<string | undefined> {
    const latest = await this.deps.records.latest(visitId, "session");

    return latest ? (latest.body as { ref: string }).ref : undefined;
  }

  // What the agent said last, stored whole under each name the station declares as `from: output`.
  private async outputsOf(station: StationBody, text: string): Promise<Record<string, string>> {
    const declared = station.produces.filter((produce) => produce.from === "output");

    if (declared.length === 0) return {};
    const stored = await this.deps.blobs.put(Buffer.from(text), "text/plain; charset=utf-8");

    return Object.fromEntries(declared.map((produce) => [produce.name, stored.hash]));
  }

  // Only what the station declares as a file it produces; a later upload under the same name wins.
  private async filesOf(visitId: string, station: StationBody): Promise<Record<string, string>> {
    const page = await this.deps.records.list(visitId, "produced", { limit: MAX_NOTES });
    const notes = page.items.map((record) => record.body as { name: string; ref: string });
    const declared = notes.filter((note) => declares(station, note.name, "file"));

    return Object.fromEntries(declared.map((note) => [note.name, note.ref]));
  }
}

function recordKindOf(event: SinkEvent): RecordKind {
  if (event.kind === "turn") return "turn";

  return event.kind === "result" ? "llm_call" : "log";
}

// The result line is kept whole for the record and summarised for the report that will be read from it. Its cost is what the agent said, or what its counts come to at the prices the visit's agent definition stated.
function noteOf(visit: Visit, event: SinkEvent, payload: unknown): unknown {
  return event.kind === "result" ? { text: event.text, failed: event.failed, ...event.cost, ...pricedBy(visit.agentSettings, event.cost) } : payload;
}

function declaredValues(station: StationBody, said: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(said).filter(([name]) => declares(station, name, "value")));
}

function declares(station: StationBody, name: string, kind: "value" | "file"): boolean {
  return station.produces.some((produce) => produce.name === name && produce.kind === kind);
}

// The agent's own last words first; the supervisor's reason only when it never spoke.
function failureOf(ended: Ended, result: ResultNote | null): string {
  const spoken = result?.failed ? result.text : "";

  return (spoken || ended.error || "the agent failed").slice(0, MAX_ERROR_CHARS);
}

function withSession(report: Report, sessionRef: string | undefined): Report {
  const defined = Object.entries({ ...report, sessionRef }).filter(([, value]) => value !== undefined);

  return Object.fromEntries(defined) as unknown as Report;
}
