// The lines whose body differs between a base collection and a head collection.

import { isDeepStrictEqual } from "node:util";

import type { Fields, Pipeline } from "../shape.js";

export interface LineChange {
  id: string;
  base?: Fields;
  head?: Fields;
}

export function changedLines(base: Pipeline[], head: Pipeline[]): LineChange[] {
  const baseBodies = bodiesById(base);
  const headBodies = bodiesById(head);

  const differing = [...headBodies]
    .filter(([id, body]) => !isDeepStrictEqual(baseBodies.get(id), body))
    .map(([id, body]) => ({ id, base: baseBodies.get(id), head: body }));
  const removed = [...baseBodies]
    .filter(([id]) => !headBodies.has(id))
    .map(([id, body]) => ({ id, base: body }));

  return [...differing, ...removed];
}

function bodiesById(pipelines: Pipeline[]): Map<string, Fields> {
  return new Map(
    pipelines.flatMap(({ line }) => (line ? [[line.id, line.body]] : [])),
  );
}
