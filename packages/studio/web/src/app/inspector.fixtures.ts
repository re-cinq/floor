import type { NodeView } from "@protocol";

export function nodeView(overrides: Partial<NodeView> & Pick<NodeView, "id">): NodeView {
  return { outcomes: [], needs: [], produces: [], events: { startedBy: [], answeredBy: [], raises: [] }, ...overrides };
}
