import type { ElkLayout } from "../elk-layout";
import { edgeKeyOf } from "./edge-key";

export type LayoutDiff = { added: string[]; moved: string[]; removed: string[] };

export function diffLayouts(before: ElkLayout | null, after: ElkLayout): LayoutDiff {
  if (before === null) return { added: [], moved: [], removed: [] };

  const beforeSignatures = signaturesOf(before);
  const afterSignatures = signaturesOf(after);
  const afterKeys = [...afterSignatures.keys()];

  return {
    added: afterKeys.filter((key) => !beforeSignatures.has(key)),
    moved: afterKeys.filter((key) => beforeSignatures.has(key) && beforeSignatures.get(key) !== afterSignatures.get(key)),
    removed: [...beforeSignatures.keys()].filter((key) => !afterSignatures.has(key)),
  };
}

function signaturesOf({ nodes, edges }: ElkLayout): Map<string, string> {
  const signatures = new Map<string, string>();

  for (const node of nodes) signatures.set(node.id, `${node.x},${node.y}`);
  for (const edge of edges) signatures.set(edgeKeyOf(edge), edge.d);

  return signatures;
}

export type NodeOffset = { dx: number; dy: number };

export function offsetsOf(before: ElkLayout | null, after: ElkLayout): Map<string, NodeOffset> {
  const offsets = new Map<string, NodeOffset>();
  const oldNodes = new Map((before?.nodes ?? []).map((node) => [node.id, node]));

  for (const node of after.nodes) {
    const old = oldNodes.get(node.id);
    if (old) offsets.set(node.id, { dx: old.x - node.x, dy: old.y - node.y });
  }

  return offsets;
}
