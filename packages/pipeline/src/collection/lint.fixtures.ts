import { pipelineProblems, type PipelineProblem } from "./lint-rules.js";

export const prompts = new Map([["spec-tickets-decompose", "Decompose {spec_path}, merged at {merge_sha}. Read {existing_tickets_path}. Write {decomposition_path}."]]);

export function problems(yamlText: string): PipelineProblem[] {
  return pipelineProblems(yamlText, prompts);
}

export function rules(yamlText: string): string[] {
  return problems(yamlText).map((problem) => problem.rule);
}

export const ONE_LABEL_NODE_FOR_EVERY_VERDICT = `
line:
  id: triage
  entry: reproduce
  exit: done
  args:
    issue_url:
      kind: value
      subject: true
  nodes:
    - id: reproduce
      station: triage-reproduce
    - id: triage-label
      station: triage-label
    - id: diagnose
      station: triage-reproduce
    - id: done
  edges:
    - from: reproduce
      to: triage-label
      on: success
    - from: triage-label
      to: diagnose
      on: success
    - from: triage-label
      to: done
      on: success
    - from: diagnose
      to: done
      on: success
stations:
  triage-reproduce:
    kind: service
    outcomes:
      - success
    needs: []
    produces: []
  triage-label:
    kind: service
    outcomes:
      - success
    needs: []
    produces: []
`;


export const SOUND = `
line:
  id: sound
  entry: work
  exit: done
  args:
    issue_url:
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
    - from: work
      to: done
      on: failed
stations:
  work:
    kind: service
    outcomes:
      - success
      - failed
    needs: []
    produces: []
`;

export const SPEC_TICKETS_DECOMPOSE_REUSED = `
line:
  id: triage
  entry: decompose
  exit: done
  args:
    issue_url:
      kind: value
      subject: true
  nodes:
    - id: decompose
      station: decompose
    - id: done
  edges:
    - from: decompose
      to: done
      on: always
stations:
  decompose:
    kind: agent
    agent_definition: spec-tickets-decompose
    outcomes:
      - success
    needs: []
    produces: []
`;

export const DECOMPOSE_INPUTS_DECLARED = SPEC_TICKETS_DECOMPOSE_REUSED.replace(
  "    issue_url:\n",
  "    spec_path:\n      kind: value\n    merge_sha:\n      kind: value\n    existing_tickets:\n      kind: file\n    issue_url:\n",
).replace(
  "    needs: []\n    produces: []\n",
  `    needs:
      - name: spec_path
        kind: value
      - name: merge_sha
        kind: value
      - name: existing_tickets
        kind: file
        path: existing-tickets.json
    produces:
      - name: decomposition
        kind: file
        path: decomposition.json
`,
);

