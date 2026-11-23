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

export const WRITE_REVIEW_COLLECTION: CollectionFile[] = [
  {
    path: "flow/assembly-line.yaml",
    text: `line:
  id: flow
  entry: write
  exit: done
  args: {}
  nodes:
    - id: write
      station: write
    - id: review
      station: review
    - id: done
  edges:
    - from: write
      to: review
      on: success
    - from: review
      to: done
      on: success
stations:
  write:
    description: Writes the draft.
    kind: agent
    agent_definition: worker
    outcomes:
      - success
    needs: []
    produces:
      - name: draft
        kind: value
  review:
    description: Reviews the draft.
    kind: agent
    agent_definition: worker
    outcomes:
      - success
    needs:
      - name: draft
        kind: value
    produces: []
`,
  },
  WORKER_COLLECTION[1],
];

export const PLAN_WRITE_COLLECTION: CollectionFile[] = [
  {
    path: "flow/assembly-line.yaml",
    text: `line:
  id: flow
  entry: plan
  exit: done
  args:
    draft:
      kind: value
  nodes:
    - id: plan
      station: plan
    - id: write
      station: write
    - id: done
  edges:
    - from: plan
      to: write
      on: success
    - from: write
      to: done
      on: success
stations:
  plan:
    description: Plans the draft.
    kind: agent
    agent_definition: worker
    outcomes:
      - success
    needs:
      - name: draft
        kind: value
    produces: []
  write:
    description: Writes the draft.
    kind: agent
    agent_definition: worker
    outcomes:
      - success
    needs: []
    produces:
      - name: draft
        kind: value
`,
  },
  WORKER_COLLECTION[1],
];
