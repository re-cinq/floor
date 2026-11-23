import { describe, expect, it } from "vitest";
import { pipelineProblems } from "./lint-rules.js";
import { DECOMPOSE_INPUTS_DECLARED, SOUND, SPEC_TICKETS_DECOMPOSE_REUSED, problems, rules } from "./lint.fixtures.js";

describe("pipelineProblems — the subject a line keys its runs on", () => {
  it("reports unkeyed-line when no arg carries subject: true", () => {
    expect(rules(SOUND.replace("      subject: true\n", ""))).toEqual([
      "unkeyed-line",
    ]);
  });

  it("reports unkeyed-line naming both args when two carry subject: true", () => {
    const two = SOUND.replace(
      "    issue_url:\n      kind: value\n      subject: true\n",
      "    issue_url:\n      kind: value\n      subject: true\n    repo:\n      kind: value\n      subject: true\n",
    );

    expect(problems(two)).toMatchObject([
      {
        line: "sound",
        rule: "unkeyed-line",
        detail: expect.stringContaining("issue_url, repo"),
      },
    ]);
  });
});


describe("pipelineProblems — the inputs an agent's recipe reads", () => {
  it("reports unsupplied-input naming spec_path when a line reuses spec-tickets-decompose and supplies none of its inputs", () => {
    expect(problems(SPEC_TICKETS_DECOMPOSE_REUSED)).toMatchObject([
      { line: "triage", node: "decompose", rule: "unsupplied-input", detail: expect.stringContaining("spec_path") },
    ]);
  });

  it("reports nothing for the placeholders the floor fills from the run, around a retry and in a fan-out branch", () => {
    const floorFilled = new Map([["spec-tickets-decompose", "{run_id} {line_id} {node_id} {git_credential} {git_credential_url} {previous_error} {previous_failures} {item}"]]);

    expect(pipelineProblems(SPEC_TICKETS_DECOMPOSE_REUSED, floorFilled)).toEqual([]);
  });

  it("reports unsupplied-input naming context, description and prompt, which the floor does not fill", () => {
    const unfilled = new Map([["spec-tickets-decompose", "{prompt} {context} {description}"]]);

    expect(pipelineProblems(SPEC_TICKETS_DECOMPOSE_REUSED, unfilled)).toMatchObject([
      {
        node: "decompose",
        rule: "unsupplied-input",
        detail: "the spec-tickets-decompose prompt reads context, description, prompt, which the station lists in neither its needs nor its produces",
      },
    ]);
  });

  it("reports nothing when a need supplies the placeholder, counting a _path suffix as the bag item's name", () => {
    expect(rules(DECOMPOSE_INPUTS_DECLARED)).toEqual([]);
  });

  it("reports unsupplied-input naming issue_url, an argument of the line the station does not list as a need", () => {
    const readsAnArgument = new Map([["spec-tickets-decompose", "Read the issue at {issue_url}."]]);

    expect(pipelineProblems(SPEC_TICKETS_DECOMPOSE_REUSED, readsAnArgument)).toMatchObject([
      { node: "decompose", rule: "unsupplied-input", detail: "the spec-tickets-decompose prompt reads issue_url, which the station lists in neither its needs nor its produces" },
    ]);
  });

  it("reports unsupplied-input naming args.issue_url when a recipe reads the arg under a dotted name the floor never fills", () => {
    const dottedRecipe = new Map([
      ["spec-tickets-decompose", "Read the issue at `{args.issue_url}`."],
    ]);

    expect(
      pipelineProblems(SPEC_TICKETS_DECOMPOSE_REUSED, dottedRecipe),
    ).toMatchObject([
      {
        node: "decompose",
        rule: "unsupplied-input",
        detail: expect.stringContaining("args.issue_url"),
      },
    ]);
  });
});


describe("pipelineProblems — where an agent is declared", () => {
  it("reports agent-settings-in-pipeline for a file that still carries an agent_definitions block", () => {
    const declared = `${SPEC_TICKETS_DECOMPOSE_REUSED}agent_definitions:
  spec-tickets-decompose:
    settings:
      model: gemini-3.1-pro-preview
`;

    expect(problems(declared)).toContainEqual({
      line: "triage",
      node: undefined,
      rule: "agent-settings-in-pipeline",
      detail:
        "the file carries an agent_definitions block; in a collection an agent's settings live in <line>/agents/<agent>.md",
    });
  });

  it("reports undeclared-agent naming triage-guess for a station whose agent has no file", () => {
    const unknown = SPEC_TICKETS_DECOMPOSE_REUSED.replace(
      "agent_definition: spec-tickets-decompose",
      "agent_definition: triage-guess",
    );

    expect(problems(unknown)).toEqual([
      {
        line: "triage",
        node: undefined,
        rule: "undeclared-agent",
        detail:
          'station "decompose" names agent definition "triage-guess", and nothing defines it: a collection defines an agent in <line>/agents/<agent>.md',
      },
    ]);
  });
});
