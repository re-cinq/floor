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
