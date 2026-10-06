// The dispatcher's test files share one scene: a work line, its stations, and the helpers that drive the queue until it is idle.
import { OutsideEvents, type LineBody, type StationBody } from "@floor/store";
import type { TestServer } from "../test-server.js";
import { Dispatcher } from "./dispatcher.js";

export const MISSING_RUN = "0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01";
export const MISSING_VISIT = "5c2a9b1e-3d4f-4c6a-8b7e-9f0a1b2c3d4e";
const MAX_TICKS = 20;

export const WORK_LINE: LineBody = {
  entry: "work",
  exit: "done",
  args: {},
  nodes: [
    { id: "work", station: "work" },
    { id: "check", station: "check", start: "manual.work.check" },
    { id: "done" },
  ],
  edges: [
    { from: "work", to: "done", on: "success" },
    { from: "check", to: "work", on: "always" },
  ],
};

export const WORK_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };
export const NEEDY_STATION: StationBody = { ...WORK_STATION, needs: [{ name: "plan", kind: "file" }] };

/** The helpers, bound to the test server of the file that makes one. Arrow fields, so a test can take them apart. */
export class DispatcherScene {
  constructor(private readonly deps: TestServer["deps"]) {}

  readonly tickUntilIdle = async (): Promise<void> => {
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      if ((await this.dispatcher().tick()) === 0) return;
    }
  };

  readonly dispatcher = (outside: OutsideEvents = this.deps().outside): Dispatcher =>
    new Dispatcher({
      runs: this.deps().runs,
      events: this.deps().events,
      outside,
      schedules: this.deps().schedules,
      claimedBy: "floor-test",
    });

  readonly defineLine = async (line: LineBody, workStation: StationBody = WORK_STATION): Promise<void> => {
    await this.deps().definitions.put("line", "line", line);
    await this.deps().definitions.put("station", "work", workStation);
    await this.deps().definitions.put("station", "check", WORK_STATION);
  };

  readonly startLine = async (line: LineBody, workStation: StationBody = WORK_STATION): Promise<string> => {
    await this.defineLine(line, workStation);
    const { run } = await this.deps().runs.start({ lineId: "line", repo: "r", startItems: {} });

    return run.id;
  };

  readonly workOpened = async () => {
    const runId = await this.startLine(WORK_LINE);

    await this.tickUntilIdle();
    const visits = await this.deps().runs.visits(runId);
    const runEvents = await this.deps().events.listByRun(runId);

    return { runId, visits, runEvents };
  };

  readonly postedThenHandled = async (name: string, payload: Record<string, unknown>) => {
    const posted = await this.deps().events.enqueue({ name, payload });

    await this.tickUntilIdle();

    return (await this.deps().events.get(posted.id))!;
  };
}
