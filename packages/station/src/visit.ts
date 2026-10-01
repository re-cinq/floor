// One visit, worked: the brief fetched, the function called with its tools, the report posted. A function that throws has failed its visit; a floor out of reach has failed nothing yet.
import type { Floor, VisitBrief } from "./floor.js";
import type { Brief, Handle, Report, Tools } from "./types.js";

const MS_PER_MINUTE = 60_000;
const MAX_ERROR_CHARS = 2500;

export interface VisitWork {
  floor: Floor;
  station: string;
  handle: Handle;
}

/** Works the visit to its report. Returns without reporting when the visit is already done. */
export async function workVisit(work: VisitWork, visitId: string): Promise<void> {
  const fetched = await work.floor.brief(visitId);

  if (!fetched) return;
  const files: Record<string, string> = {};
  const deadline = AbortSignal.timeout(fetched.deadlineMinutes * MS_PER_MINUTE);
  const report = await handled(work.handle, briefOf(fetched), toolsFor({ floor: work.floor, fetched, files, signal: deadline }));

  await work.floor.report(visitId, withFiles(report, files), `station:${work.station}`);
}

async function handled(handle: Handle, brief: Brief, tools: Tools): Promise<Report> {
  try {
    return await handle(brief, tools);
  } catch (error) {
    return { outcome: "failed", error: messageOf(error).slice(0, MAX_ERROR_CHARS) };
  }
}

function briefOf(fetched: VisitBrief): Brief {
  const needs = fetched.needs.map((need) => [need.name, textOf(need)] as const);

  return { visitId: fetched.visitId, runId: fetched.runId, lineId: fetched.lineId, iteration: fetched.iteration, needs: Object.fromEntries(needs) };
}

function textOf(need: VisitBrief["needs"][number]): string {
  if (need.kind === "value") return need.value;

  return need.kind === "file" ? need.url : `${need.repoUrl}@${need.ref}`;
}

interface ToolContext {
  floor: Floor;
  fetched: VisitBrief;
  files: Record<string, string>;
  signal: AbortSignal;
}

function toolsFor(context: ToolContext): Tools {
  const { floor, fetched, files, signal } = context;

  return {
    signal,
    read: (need) => floor.read(fileNeed(fetched, need), fetched.token),
    produce: async (name, bytes) => {
      files[name] = await floor.store(Buffer.from(bytes), fetched.token);
    },
    modelCall: (call) => floor.record(fetched.visitId, call, fetched.token),
  };
}

function fileNeed(fetched: VisitBrief, name: string): string {
  const need = fetched.needs.find((candidate) => candidate.name === name);

  if (need?.kind !== "file") throw new Error(`"${name}" is not a file this visit was given`);

  return need.url;
}

// A file produced through the tools wins over a value of the same name: it is the one that was stored.
function withFiles(report: Report, files: Record<string, string>): Report {
  const produced = { ...report.produced, ...files };

  return Object.keys(produced).length > 0 ? { ...report, produced } : report;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
