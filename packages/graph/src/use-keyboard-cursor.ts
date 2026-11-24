import { useState, type KeyboardEvent } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { edgeKeyOf } from "./metro/edge-key";
import { outgoingEdgesOf } from "./metro/node-edges";
import { stepAlong, type Cursor, type Direction } from "./metro/step-along";

export interface KeyboardCursor {
  /** The key of the line the cursor is on, or null before any station is focused. */
  chosenKey: string | null;
  onFocusNode: (nodeId: string) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
}

const DIRECTION_BY_KEY: Record<string, Direction | undefined> = {
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowLeft: "left",
};

/** A cursor on the stations and their out-lines: focus puts it on a station's first line, ArrowDown and ArrowUp cycle that station's lines. */
export function useKeyboardCursor(definition: AssemblyLineDefinition): KeyboardCursor {
  const [cursor, setCursor] = useState<Cursor | null>(null);

  return {
    chosenKey: cursor && chosenKeyOf(definition, cursor),
    onFocusNode: (nodeId) => setCursor((current) => (current?.nodeId === nodeId ? current : { nodeId, lineIndex: 0 })),
    onKeyDown: (event) => {
      const direction = DIRECTION_BY_KEY[event.key];
      if (!direction) return;

      event.preventDefault();
      if (!cursor) return;

      const next = stepAlong(definition, cursor, direction);
      setCursor(next);
      if (next.nodeId !== cursor.nodeId) focusStation(event.currentTarget, next.nodeId);
    },
  };
}

function focusStation(fromStation: SVGGElement, nodeId: string): void {
  const stations = Array.from(fromStation.ownerSVGElement?.querySelectorAll<SVGGElement>("[data-node]") ?? []);
  stations.find((station) => station.dataset.node === nodeId)?.focus();
}

function chosenKeyOf(definition: AssemblyLineDefinition, { nodeId, lineIndex }: Cursor): string | null {
  const edge = outgoingEdgesOf(definition, nodeId).at(lineIndex);

  return edge ? edgeKeyOf(edge) : null;
}
