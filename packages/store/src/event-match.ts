// Pure: what an event from outside means to one line — whether it starts it, with which items, and which waiting node it answers.
import { canonicalRepo, gitRefOf } from "./repo-name.js";
import { enforce } from "./refusal.js";
import { renderTemplate } from "./template.js";
import type { Item, LineBody, WhenValue } from "./types.js";

export type Payload = Record<string, unknown>;

export interface Answer {
  nodeId: string;
  outcome: string;
}

export function matchesWhen(when: Record<string, WhenValue> | undefined, payload: Payload): boolean {
  return Object.entries(when ?? {}).every(([field, expected]) => Object.hasOwn(payload, field) && String(payload[field]) === String(expected));
}

export function startsOn(line: LineBody, eventName: string, payload: Payload): boolean {
  const start = line.start;

  return Boolean(start?.on.includes(eventName)) && matchesWhen(start?.when, payload);
}

export function startItemsFrom(line: LineBody, eventName: string, payload: Payload): Record<string, Item> {
  const templates = Object.entries(line.start?.args ?? {});

  return Object.fromEntries(templates.map(([name, template]) => [name, startItem(line, name, renderTemplate(template, payload), eventName)]));
}

function startItem(line: LineBody, name: string, ref: string, eventName: string): Item {
  const spec = (line.args as Partial<LineBody["args"]>)[name];

  enforce(spec, `start maps "${name}", which the line does not declare as an argument`);

  return { kind: spec.kind, ref, by: eventName };
}

/** The run's repo: the one its `git` argument names, else the one the payload carries, else none. */
export function repoFrom(startItems: Record<string, Item>, payload: Payload): string | null {
  const gitItem = Object.values(startItems).find((startItem) => startItem.kind === "git");

  if (gitItem) return gitRefOf(gitItem.ref).repo;
  const carried = payload.repo ?? payload.repository;

  return typeof carried === "string" && carried.length > 0 ? canonicalRepo(carried) : null;
}

/** One answer per node at most: the first of its `reports` this event satisfies. */
export function answersOf(line: LineBody, eventName: string, payload: Payload): Answer[] {
  return line.nodes.flatMap((node) => {
    const report = node.reports?.find((candidate) => candidate.on === eventName && matchesWhen(candidate.when, payload));

    return report ? [{ nodeId: node.id, outcome: report.outcome }] : [];
  });
}
