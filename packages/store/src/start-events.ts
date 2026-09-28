// A node's start event: `node.<id>.start` unless the line names another, for a node a person or an outside system starts.
import type { LineBody, LineNode } from "./types.js";
import { enforce } from "./refusal.js";

export function startEventName(node: LineNode): string {
  return node.start ?? `node.${node.id}.start`;
}

export function nodeStartedBy(line: LineBody, eventName: string): LineNode | null {
  return line.nodes.find((node) => startEventName(node) === eventName) ?? null;
}

export function requireNode(line: LineBody, nodeId: string): LineNode {
  const node = line.nodes.find((candidate) => candidate.id === nodeId);

  enforce(node, `no node "${nodeId}" in this line`);

  return node;
}
