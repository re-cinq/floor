import { describe, expect, it } from "vitest";
import { SOUND, problems } from "./lint.fixtures.js";

describe("pipelineProblems — what the floor requires of a station", () => {
  const NO_BAG = SOUND.replace("    needs: []\n    produces: []\n", "");

  it("reports undeclared-bag naming the station and both missing arrays", () => {
    expect(problems(NO_BAG)).toEqual([
      {
        line: "sound",
        node: undefined,
        rule: "undeclared-bag",
        detail:
          'station "work" declares no needs and no produces; the floor requires both arrays',
      },
    ]);
  });

  it("reports undeclared-bag naming produces alone when needs is declared", () => {
    expect(problems(SOUND.replace("    produces: []\n", ""))).toEqual([
      {
        line: "sound",
        node: undefined,
        rule: "undeclared-bag",
        detail:
          'station "work" declares no produces; the floor requires both arrays',
      },
    ]);
  });

  it("reports nothing for a station whose bag arrays are empty but declared", () => {
    expect(problems(SOUND)).toEqual([]);
  });
});


const BOUND_TO_REMOVED_ARG = `
line:
  id: planning
  entry: ground
  exit: done
  args:
    repo:
      kind: git
    plan_id:
      kind: value
      subject: true
  nodes:
    - id: ground
      station: ground
      bind:
        target: base
    - id: done
  edges:
    - from: ground
      to: done
      on: always
stations:
  ground:
    kind: service
    outcomes:
      - success
    needs:
      - name: target
        kind: git
        path: target
        access: read
    produces: []
`;

const FILE_NEED = SOUND.replace(
  "    needs: []\n",
  `    needs:
      - name: ticket
        kind: file
        path: ticket.md
`,
);


describe("pipelineProblems — the bag a node reads", () => {
  it("reports unseeded-need for a node binding target to a git arg the line does not declare, as feature-planning's plan-grounding bound base", () => {
    expect(problems(BOUND_TO_REMOVED_ARG)).toEqual([
      {
        line: "planning",
        node: "ground",
        rule: "unseeded-need",
        detail:
          'node "ground" needs "target" (bound as "base") as kind "git", which nothing in the line seeds',
      },
    ]);
  });

  it("reports nothing when the bind names a git arg the line declares", () => {
    expect(
      problems(
        BOUND_TO_REMOVED_ARG.replace(
          "        target: base",
          "        target: repo",
        ),
      ),
    ).toEqual([]);
  });

  it("reports unseeded-need for a required file need nothing seeds or produces", () => {
    expect(problems(FILE_NEED)).toEqual([
      {
        line: "sound",
        node: "work",
        rule: "unseeded-need",
        detail:
          'node "work" needs "ticket", which nothing in the line seeds or produces',
      },
    ]);
  });

  it("reports nothing for an optional need", () => {
    expect(
      problems(
        FILE_NEED.replace(
          "        path: ticket.md\n",
          "        path: ticket.md\n        optional: true\n",
        ),
      ),
    ).toEqual([]);
  });

  it("reports nothing for a need a station in the line produces", () => {
    expect(
      problems(
        FILE_NEED.replace(
          "    produces: []\n",
          "    produces:\n      - name: ticket\n        kind: file\n",
        ),
      ),
    ).toEqual([]);
  });

  it("reports nothing for a need the line's files seed", () => {
    expect(
      problems(
        FILE_NEED.replace(
          "  args:\n",
          "  files:\n    ticket: abc123\n  args:\n",
        ),
      ),
    ).toEqual([]);
  });

  it("reports nothing for previous_error, which the floor fills around a retry", () => {
    expect(
      problems(FILE_NEED.replace("name: ticket", "name: previous_error")),
    ).toEqual([]);
  });
});

