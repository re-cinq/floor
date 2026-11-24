// Keyboard navigation over an assembly line definition: follow an edge right, back left, or cycle lines up and down.
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { declaredIdsOf } from "./declared-ids";
import { incomingEdgesOf, outgoingEdgesOf } from "./node-edges";

export type Direction = "right" | "left" | "up" | "down";

export interface Cursor {
  nodeId: string;
  lineIndex: number;
}

type Step = (definition: AssemblyLineDefinition, cursor: Cursor) => Cursor;

const stepRight: Step = (definition, cursor) => {
  const edge = cursor.lineIndex < 0 ? undefined : outgoingEdgesOf(definition, cursor.nodeId).at(cursor.lineIndex);
  if (!edge || !declaredIdsOf(definition).has(edge.to)) return cursor;

  return { nodeId: edge.to, lineIndex: 0 };
};

function cycleLine(offset: 1 | -1): Step {
  return (definition, cursor) => {
    const edgeCount = outgoingEdgesOf(definition, cursor.nodeId).length;
    if (edgeCount === 0) return cursor;

    return { nodeId: cursor.nodeId, lineIndex: (((cursor.lineIndex + offset) % edgeCount) + edgeCount) % edgeCount };
  };
}

const stepLeft: Step = (definition, cursor) => {
  const incoming = incomingEdgesOf(definition, cursor.nodeId).at(0);
  if (!incoming || !declaredIdsOf(definition).has(incoming.from)) return cursor;

  return { nodeId: incoming.from, lineIndex: outgoingEdgesOf(definition, incoming.from).indexOf(incoming) };
};

const stepsByDirection: Record<Direction, Step> = { right: stepRight, left: stepLeft, down: cycleLine(1), up: cycleLine(-1) };

/** The cursor after one step in `direction`; right follows the edge at the cursor's line index, left returns along the first incoming edge, down and up cycle the station's lines with wrapping; impossible moves stay put. */
export function stepAlong(definition: AssemblyLineDefinition, cursor: Cursor, direction: Direction): Cursor {
  return stepsByDirection[direction](definition, cursor);
}
