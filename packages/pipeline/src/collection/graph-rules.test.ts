import { describe, expect, it } from "vitest";
import { ONE_LABEL_NODE_FOR_EVERY_VERDICT, SOUND, problems, rules } from "./lint.fixtures.js";

describe("pipelineProblems — the edges a node routes", () => {
  it("reports ambiguous-edge for the issue-triage topology where every verdict routes into one triage-label node", () => {
    expect(problems(ONE_LABEL_NODE_FOR_EVERY_VERDICT)).toMatchObject([
      {
        line: "triage",
        node: "triage-label",
        rule: "ambiguous-edge",
        detail: expect.stringContaining("success"),
      },
    ]);
  });

  it("reports nothing for a line whose every node routes each outcome once", () => {
    expect(problems(SOUND)).toEqual([]);
  });

  it("reports outcome-without-edge for a declared outcome no edge routes", () => {
    const unrouted = SOUND.replace(
      "    - from: work\n      to: done\n      on: failed\n",
      "",
    );

    expect(problems(unrouted)).toMatchObject([
      {
        line: "sound",
        node: "work",
        rule: "outcome-without-edge",
        detail: expect.stringContaining("failed"),
      },
    ]);
  });

  it("reports nothing for a node that routes always instead of naming each outcome", () => {
    const always = SOUND.replace(
      "      on: failed",
      "      on: always",
    ).replace("    - from: work\n      to: done\n      on: success\n", "");

    expect(problems(always)).toEqual([]);
  });
});


const DEAD_END = `
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
      station: reproduce
    - id: triage-label
    - id: done
  edges:
    - from: reproduce
      to: triage-label
      on: success
    - from: reproduce
      to: triage-label
      on: skipped
stations:
  reproduce:
    kind: agent
    outcomes:
      - success
      - skipped
    needs: []
    produces: []
`;


describe("pipelineProblems — where a run can get to", () => {
  it("reports dead-end for the issue-triage label node every verdict routes into and nothing leaves, and unreachable for the exit it strands", () => {
    expect(problems(DEAD_END)).toMatchObject([
      {
        line: "triage",
        node: "triage-label",
        rule: "dead-end",
        detail: expect.stringContaining("no edge leaves it"),
      },
      { node: "done", rule: "unreachable" },
    ]);
  });

  it("reports nothing for the exit node, which is where a run is meant to stop", () => {
    expect(rules(SOUND)).toEqual([]);
  });

  it("reports nothing for the fail node a failed edge routes into, which ends the run as failed", () => {
    const failingToFailNode = SOUND.replace(
      "  exit: done\n",
      "  exit: done\n  fail: failed\n",
    )
      .replace("    - id: done\n", "    - id: done\n    - id: failed\n")
      .replace(
        "      to: done\n      on: failed\n",
        "      to: failed\n      on: failed\n",
      );

    expect(rules(failingToFailNode)).toEqual([]);
  });

  it("reports unreachable for a node no edge and no start event reaches", () => {
    const orphan = SOUND.replace(
      "    - id: done\n",
      "    - id: orphan\n      station: work\n    - id: done\n",
    ).replace(
      "    - from: work\n      to: done\n      on: failed\n",
      `    - from: work
      to: done
      on: failed
    - from: orphan
      to: done
      on: always
`,
    );

    expect(problems(orphan)).toMatchObject([
      { node: "orphan", rule: "unreachable" },
    ]);
  });

  it("reports dangling-edge for an edge to a node the line never declares, as issue-triage's verify named decompose", () => {
    const dangling = SOUND.replace(
      "    - from: work\n      to: done\n      on: failed\n",
      "    - from: work\n      to: decompose\n      on: failed\n",
    );

    expect(problems(dangling)).toMatchObject([
      {
        line: "sound",
        node: "work",
        rule: "dangling-edge",
        detail: expect.stringContaining("decompose"),
      },
    ]);
  });

  it("reports dangling-edge for an edge from a node the line never declares", () => {
    const dangling = SOUND.replace(
      "    - from: work\n      to: done\n      on: failed\n",
      "    - from: work\n      to: done\n      on: failed\n    - from: verify\n      to: done\n      on: always\n",
    );

    expect(problems(dangling)).toMatchObject([
      {
        line: "sound",
        node: "verify",
        rule: "dangling-edge",
        detail: expect.stringContaining("verify"),
      },
    ]);
  });

  it("reports nothing for a node its own start event reaches, as feature-planning's validate is entered", () => {
    const byHand = SOUND.replace(
      "    - id: done\n",
      "    - id: validate\n      station: work\n      start: manual.plan.validate\n    - id: done\n",
    ).replace(
      "    - from: work\n      to: done\n      on: failed\n",
      `    - from: work
      to: done
      on: failed
    - from: validate
      to: done
      on: always
`,
    );

    expect(rules(byHand)).toEqual([]);
  });
});


describe("pipelineProblems — the outcomes an edge may route on", () => {
  it("reports undeclared-outcome for an edge leaving on an outcome its station never declares", () => {
    const undeclared = SOUND.replace("      on: failed", "      on: obsolete");
    const found = problems(undeclared);

    expect({
      rules: found.map((problem) => problem.rule).sort(),
      undeclared: found.find(
        (problem) => problem.rule === "undeclared-outcome",
      ),
    }).toMatchObject({
      rules: ["outcome-without-edge", "undeclared-outcome"],
      undeclared: {
        line: "sound",
        node: "work",
        detail: expect.stringContaining("obsolete"),
      },
    });
  });

  it("reports nothing for an always edge, which no station declares", () => {
    const always = SOUND.replace(
      "      on: failed",
      "      on: always",
    ).replace("    - from: work\n      to: done\n      on: success\n", "");

    expect(rules(always)).toEqual([]);
  });
});

