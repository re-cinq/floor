import type { CollectionFile } from "@re-cinq/floor-pipeline";

export function lineYaml(id: string, agent: string): string {
  return `line:
  id: ${id}
  entry: work
  exit: done
  args:
    ticket:
      kind: value
      subject: true
  nodes:
    - id: work
      station: work
    - id: done
  edges:
    - from: work
      to: done
      on: success
stations:
  work:
    description: Works the ticket.
    kind: agent
    agent_definition: ${agent}
    outcomes:
      - success
    needs:
      - name: ticket
        kind: value
    produces: []
`;
}

export function agentMarkdown(prompt: string, extraFrontmatter = ""): string {
  return `---\nimage: acme/agent:2\ntimeout_minutes: 10\n${extraFrontmatter}---\n${prompt}\n`;
}

export const WORKER_COLLECTION: CollectionFile[] = [
  { path: "flow/assembly-line.yaml", text: lineYaml("flow", "worker") },
  { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket}.") },
];

export const TYPO_COLLECTION: CollectionFile[] = [WORKER_COLLECTION[0], { path: "flow/agents/worker.md", text: agentMarkdown("Work {ticket} and tell {typo}.") }];
