// Events from outside the walk (docs/assembly_run_storage.md, "Starting a run", "An event may answer for a person"): they start lines that declare them, and answer nodes that wait on them.
import type { Pool } from "pg";
import type { AssemblyRunStore } from "./assembly-run-store.js";
import type { StartResult } from "./run-shapes.js";
import type { DefinitionRow, DefinitionsStore } from "./definitions.js";
import { answersOf, repoFrom, startItemsFrom, startsOn, type Payload } from "./event-match.js";
import { Refusal, enforce } from "./refusal.js";
import { getWith } from "./rows.js";
import { nodeVisitCount, openRunBySubject } from "./sql.js";
import type { LineBody, Run, Visit } from "./types.js";

export type RunRef = { runId: string } | { subjectKey: string; repo: string | null };

export interface OutsideEvent {
  /** The queued event's id, when it came off the queue: the visit it answers is written back onto it. */
  id?: string;
  name: string;
  payload: Payload;
}

export interface OutsideEventsDeps {
  pool: Pool;
  runs: AssemblyRunStore;
  definitions: DefinitionsStore;
}

export class OutsideEvents {
  constructor(private readonly deps: OutsideEventsDeps) {}

  /** The run an event acts on: by id, or the open run holding that subject on that repo, or among the runs that have no repo when it is null. */
  async runFor(ref: RunRef): Promise<Run | null> {
    if ("runId" in ref) return getWith(this.deps.pool, ref.runId);

    return openRunBySubject(this.deps.pool, ref.repo, ref.subjectKey);
  }

  /** Starts every line declaring this event. A line that cannot start does not stop the others; what went wrong is thrown once they have all had their turn. */
  async startLines(event: OutsideEvent): Promise<StartResult[]> {
    const lines = await this.deps.definitions.linesStartedBy<LineBody>(event.name);
    const started: StartResult[] = [];
    const refused: string[] = [];

    for (const line of lines.filter((candidate) => isStartedBy(candidate, event))) {
      try {
        started.push(await this.startOne(line, event));
      } catch (error) {
        refused.push(refusalOf(line.id, error));
      }
    }

    if (refused.length > 0) throw new Refusal(refused.join("; "));

    return started;
  }

  private async startOne(line: DefinitionRow<LineBody>, event: OutsideEvent): Promise<StartResult> {
    const startItems = startItemsFrom(line.body, event.name, event.payload);

    return this.deps.runs.start({ lineId: line.id, repo: repoFrom(startItems, event.payload), startItems });
  }

  /** Writes the report on each waiting node this event answers for, in this run. */
  async answer(run: Run, event: OutsideEvent): Promise<Visit[]> {
    const line = await this.deps.definitions.byHash<LineBody>("line", run.lineId, run.lineHash);

    enforce(line, `line "${run.lineId}"@${run.lineHash} is gone`);
    const answers = answersOf(line.body, event.name, event.payload);
    const reported: Visit[] = [];

    for (const given of answers) {
      const { openVisit } = await nodeVisitCount(this.deps.pool, run.id, given.nodeId);

      if (!openVisit) continue;
      reported.push(await this.deps.runs.report(openVisit.id, { outcome: given.outcome }, `event:${event.name}`));
      await this.noteAnswered(event, openVisit.id);
    }

    return reported;
  }

  private async noteAnswered(event: OutsideEvent, visitId: string): Promise<void> {
    if (event.id === undefined) return;

    await this.deps.pool.query(NOTE_ANSWERED, [event.id, visitId]);
  }
}

// Written back onto the event so a reader of the queue can tell which visit it answered; the visit itself only says `event:<name>`.
const NOTE_ANSWERED = `update events set payload = payload || jsonb_build_object('answeredVisitId', $2::text) where id = $1`;

// A line never starts on an internal event of its own runs: its own settling would start it again, forever.
function isStartedBy(line: DefinitionRow<LineBody>, event: OutsideEvent): boolean {
  const ownInternal = event.name.startsWith("internal.") && event.payload.lineId === line.id;

  return !ownInternal && startsOn(line.body, event.name, event.payload);
}

function refusalOf(lineId: string, error: unknown): string {
  if (!(error instanceof Refusal)) throw error;

  return `line "${lineId}": ${error.message}`;
}
