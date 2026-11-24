import type { AgentFileSettings } from "./agent-file.js";
import type { OverlayAgent, ShippedCatalog } from "./agents.js";
import { collectionOverlay, type CollectionOverlay } from "./collection.js";

export const SHIPPED_REVIEWER: AgentFileSettings = { image: "agent:1", timeout_minutes: 30, prompt: "Review the diff." };

export const SHIPPED: ShippedCatalog = {
  pipelines: ["code-review"],
  agents: new Map([
    ["reviewer", SHIPPED_REVIEWER],
    ["merger", { ...SHIPPED_REVIEWER, prompt: "Merge it." }],
  ]),
};

export const TRIAGE_AGENT = "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nTriage.\n";

export function pipelineYaml(name: string, agent: string): string {
  return `line:
  id: ${name}
  entry: work
  exit: done
  args:
    repo:
      kind: git
      subject: true
  nodes:
    - id: work
      station: work
      bind:
        target: repo
    - id: done
  edges:
    - from: work
      to: done
      on: success
    - from: work
      to: work
      on: failed
      iteration_max: 1
${stationYaml(agent)}`;
}

function stationYaml(agent: string): string {
  return `stations:
  work:
    description: Works the ticket.
    kind: agent
    agent_definition: ${agent}
    conversation: new
    outcomes:
      - success
      - failed
    result_required: true
    needs:
      - name: target
        kind: git
        path: target
    produces: []
`;
}

export function agentNamed(overlay: CollectionOverlay, name: string): OverlayAgent | undefined {
  return overlay.agents.get(name);
}

const ENV = { ACME_IMAGE: "acme/agent:7" };

export function overlayOf(files: Record<string, string>, groups?: readonly string[]): CollectionOverlay {
  return collectionOverlay({
    files: Object.entries(files).map(([path, text]) => ({ path, text })),
    shipped: SHIPPED,
    env: ENV,
    groups,
  });
}

export function linesAndRefusalsOf(files: Record<string, string>) {
  const overlay = overlayOf(files);

  return { lines: overlay.pipelines.map((pipeline) => pipeline.line?.id), refused: overlay.refused };
}
