// Pure: what an event from outside means to one line — whether it starts it, with which items, and which waiting node it answers.
import { canonicalRepo, gitRefOf } from "./repo-name.js";
import { enforce, type Payload } from "@re-cinq/floor-assembly-lines";
import { renderTemplate } from "./template.js";

import type { Item, LineBody } from "./types.js";

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
