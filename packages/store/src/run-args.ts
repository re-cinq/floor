import type { Item, Run } from "./types.js";

// Only values: a file's ref is a blob hash and may point at large or private content.
export function valueArgsOf(startItems: Record<string, Item>): Record<string, string> {
  const valueEntries = Object.entries(startItems).filter(([, startItem]) => startItem.kind === "value");

  return Object.fromEntries(valueEntries.map(([name, startItem]) => [name, startItem.ref]));
}

// What an internal event says about its run: enough for a line started by it to know whose run this was, where, and which values it was given.
export function aboutRun(run: Run): Record<string, unknown> {
  return { runId: run.id, lineId: run.lineId, repo: run.repo, subjectKey: run.subjectKey, outcome: run.outcome, reason: run.reason, args: valueArgsOf(run.startItems) };
}
