// The pull request comment that draws every assembly line the change touches.

import type { LineBody } from "@re-cinq/floor-contracts";
import { z } from "zod";

import { definitionSchemas } from "../definition-schemas.js";
import type { Fields } from "../shape.js";
import type { LineChange } from "./changed-lines.js";
import { afterGraphOf, beforeGraphOf } from "./line-mermaid.js";
import { noteWithin } from "./note-within.js";

const { lineBodySchema } = definitionSchemas(z.object);

export const COMMENT_LIMIT = 65000;
const NOTE_LINE_BREAKS = 2;

export function changeReportOf(
  changes: LineChange[],
  limit = COMMENT_LIMIT,
): string {
  if (changes.length === 0) return "";

  return reportOf(changes, drawnCountOf(changes, limit), limit);
}

function drawnCountOf(changes: LineChange[], limit: number): number {
  for (let count = 1; count <= changes.length; count++) {
    if (reportOf(changes, count, limit).length > limit) return count - 1;
  }

  return changes.length;
}

function reportOf(
  changes: LineChange[],
  drawnCount: number,
  limit: number,
): string {
  const opening = [
    "<!-- floor-pack-graph -->",
    "### Assembly lines changed in this pull request",
    "",
    ...changes.slice(0, drawnCount).flatMap(sectionOf),
  ];
  const undrawnIds = changes.slice(drawnCount).map(({ id }) => id);
  const closing = [
    "<sub>green added · red dashed removed · amber changed</sub>",
    "",
  ];
  const frame = [...opening, ...closing].join("\n");
  const noteRoom = limit - frame.length - NOTE_LINE_BREAKS;

  return [...opening, ...noteWithin(undrawnIds, noteRoom), ...closing].join(
    "\n",
  );
}

function sectionOf({ id, base, head }: LineChange): string[] {
  const baseBody = lineBodyOf(base);
  const headBody = lineBodyOf(head);

  return [
    ...(baseBody ? beforeBlockOf(id, baseBody, headBody) : []),
    ...(headBody ? afterBlockOf(id, baseBody, headBody) : []),
  ];
}

function beforeBlockOf(
  id: string,
  base: LineBody,
  head: LineBody | undefined,
): string[] {
  return blockOf(`**${id}** · before`, beforeGraphOf(base, head));
}

function afterBlockOf(
  id: string,
  base: LineBody | undefined,
  head: LineBody,
): string[] {
  return blockOf(`**${id}** · proposed changes`, afterGraphOf(base, head));
}

function blockOf(title: string, graph: string): string[] {
  return [title, "", "```mermaid", graph, "```", ""];
}

function lineBodyOf(fields: Fields | undefined): LineBody | undefined {
  return fields && lineBodySchema.parse(fields);
}
