import { describe, expect, it } from "vitest";
import { pipelineProblems } from "./lint-rules.js";

const DIAMOND = `
line:
  id: planning
  entry: start
  exit: done
  args:
    issue_url:
      kind: value
      subject: true
  nodes:
    - id: start
      station: router
    - id: open
      station: opener
    - id: skip
      station: skipper
    - id: join
      station: reader
    - id: done
  edges:
    - from: start
      to: open
      on: success
    - from: start
      to: skip
      on: failed
    - from: open
      to: join
      on: success
    - from: skip
      to: join
      on: success
    - from: join
      to: done
      on: success
stations:
  router:
    kind: service
    outcomes: [success, failed]
    needs: []
    produces: []
  skipper:
    kind: service
    outcomes: [success]
    needs: []
    produces: []
  opener:
    kind: service
    outcomes: [success]
    needs: []
    produces:
      - name: ticket
        kind: value
  reader:
    kind: service
    outcomes: [success]
    needs:
      - name: ticket
        kind: value
    produces: []
`;

const AGENT_READER = DIAMOND.replace("  reader:\n    kind: service", "  reader:\n    kind: agent\n    agent_definition: reading");

function promptProblems(yamlText: string, prompt: string) {
  return pipelineProblems(yamlText, new Map([["reading", prompt]])).filter((found) => found.rule === "unsupplied-input");
}

describe("pipelineProblems, a need on every path into its node", () => {
  it("reports unseeded-need with the path start > skip > join when only open produces ticket", () => {
    expect(pipelineProblems(DIAMOND, new Map())).toEqual([
      {
        line: "planning",
        node: "join",
        rule: "unseeded-need",
        detail: 'node "join" needs "ticket", which is not seeded at start and not produced on every path into it, as on the path start > skip > join',
      },
    ]);
  });

  it("reports nothing when every path into join passes a producer", () => {
    expect(pipelineProblems(DIAMOND.replace("      station: skipper\n    - id: join", "      station: opener\n    - id: join"), new Map())).toEqual([]);
  });

  it("reports unseeded-need for a node that starts by its own event and needs a produced name", () => {
    const ownStart = DIAMOND.replace("    - id: join\n      station: reader", "    - id: join\n      station: reader\n      start: ticket.ready");

    expect(pipelineProblems(ownStart, new Map()).map(({ detail }) => detail)).toEqual(['node "join" starts by its own event, so its need "ticket" must be seeded at start']);
  });
});

describe("pipelineProblems, what a prompt is supplied with", () => {
  it("reports unsupplied-input for {ticket} when ticket is a file need, which the prompt reads as {ticket_path}", () => {
    const fileNeed = AGENT_READER.replace("      - name: ticket\n        kind: value\n    produces: []", "      - name: ticket\n        kind: file\n    produces: []");

    expect(promptProblems(fileNeed, "Read {ticket}.")).toMatchObject([{ node: "join", rule: "unsupplied-input", detail: expect.stringContaining("ticket") }]);
  });

  it("reports nothing for {ticket_path} when ticket is a file need", () => {
    const fileNeed = AGENT_READER.replace("      - name: ticket\n        kind: value\n    produces: []", "      - name: ticket\n        kind: file\n    produces: []");

    expect(promptProblems(fileNeed, "Read {ticket_path}.")).toEqual([]);
  });

  it("reports nothing for a JSON object in the prompt", () => {
    expect(promptProblems(AGENT_READER, 'Read {ticket}. End with {"outcome":"success"}.')).toEqual([]);
  });

  it("reports {git_credential} when the station has no git need", () => {
    expect(promptProblems(AGENT_READER, "{ticket} {git_credential}")).toMatchObject([{ detail: expect.stringContaining("git_credential") }]);
  });

  it("reports nothing for {git_credential} when the station has a git need the line seeds", () => {
    const gitNeed = AGENT_READER.replace("    issue_url:", "    repo:\n      kind: git\n    issue_url:").replace("      - name: ticket\n        kind: value\n    produces: []", "      - name: ticket\n        kind: value\n      - name: repo\n        kind: git\n    produces: []");

    expect(promptProblems(gitNeed, "{ticket} {repo_path} {git_credential} {git_credential_url}")).toEqual([]);
  });
});
