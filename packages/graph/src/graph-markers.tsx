import type { ElkLayout } from "./elk-layout";
import DanglingStub from "./DanglingStub";
import ExitDot from "./ExitDot";

export function markerOf(node: ElkLayout["nodes"][number], exit: string) {
  if (node.id.endsWith(":exit")) {
    return <ExitDot key={node.id} node={node} exit={exit} />;
  }

  return node.id.endsWith(":stub") ? <DanglingStub key={node.id} node={node} /> : null;
}
