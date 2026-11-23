import { describe, expect, it } from "vitest";
import { DIAMOND_STATIONS, agentStation, diamondLine } from "./diamond.fixtures.js";
import { placeholderNames, promptPlaceholders } from "./prompt-placeholders.js";
import type { LineBody, NeedSpec, ProduceSpec, StationBody } from "@re-cinq/floor-contracts";

function readerOf(needs: NeedSpec[], produces: ProduceSpec[] = []): StationBody {
  return agentStation(needs, produces);
}

function diamond(patch: Partial<LineBody> = {}): LineBody {
  return diamondLine({ args: { repo: { kind: "git" } }, ...patch });
}

function placeholdersOf(prompt: string, reader: StationBody, line: LineBody = diamond()) {
  const bodies = new Map(DIAMOND_STATIONS).set("reader", reader);

  return promptPlaceholders({ prompt, line, node: line.nodes.find((node) => node.id === "join")!, station: reader, bodies });
}

describe("placeholderNames", () => {
  it("lists each name once, in order of first appearance", () => {
    expect(placeholderNames("Fix {ticket} in {repo_path}, then {ticket} again")).toEqual(["ticket", "repo_path"]);
  });

  it("reads no placeholder in a JSON object", () => {
    expect(placeholderNames('Answer {"outcome":"success"} or { "outcome": "failed" }')).toEqual([]);
  });

  it("reads names with a dot, a hyphen or a capital, as the agent subsystem renders them", () => {
    expect(placeholderNames("{pr.url} {pr-url} {PrUrl}")).toEqual(["pr.url", "pr-url", "PrUrl"]);
  });

  it("reads no placeholder in a regex quantifier or an empty pair of braces", () => {
    expect(placeholderNames("a{3} b{} c{2,4}")).toEqual([]);
  });
});

describe("promptPlaceholders, rows", () => {
  it("is sometimes-empty with the path through skipper for {ticket} when only opener produces ticket", () => {
    const reader = readerOf([{ name: "ticket", kind: "value" }]);

    expect(placeholdersOf("Read {ticket}.", reader).placeholders).toEqual([
      { name: "ticket", source: "value-need", state: "sometimes-empty", filledBy: ["opener"], path: ["start", "skipper", "join"] },
    ]);
  });

  it("is seeded for {ticket} when a line argument is named ticket", () => {
    const reader = readerOf([{ name: "ticket", kind: "value" }]);
    const line = diamond({ args: { ticket: { kind: "value" } } });

    expect(placeholdersOf("{ticket}", reader, line).placeholders).toEqual([{ name: "ticket", source: "value-need", state: "seeded", filledBy: [], path: [] }]);
  });

  it("reads {plan_path} from a file need, with that need's coverage", () => {
    const reader = readerOf([{ name: "plan", kind: "file", path: "plan.md" }]);

    expect(placeholdersOf("Open {plan_path}", reader).placeholders).toEqual([{ name: "plan_path", source: "need-path", state: "never-filled", filledBy: [], path: [] }]);
  });

  it("reads {repo_path} from a git need a git argument seeds", () => {
    const reader = readerOf([{ name: "repo", kind: "git", path: "repo" }]);

    expect(placeholdersOf("cd {repo_path}", reader).placeholders).toEqual([{ name: "repo_path", source: "need-path", state: "seeded", filledBy: [], path: [] }]);
  });

  it("reads {note_path} from a file the station produces, always filled", () => {
    const reader = readerOf([], [{ name: "note", kind: "file", path: "note.md" }]);

    expect(placeholdersOf("Write {note_path}", reader).placeholders).toEqual([{ name: "note_path", source: "produce-path", state: "filled", filledBy: [], path: [] }]);
  });

  it("reads {run_id} and {item} as the floor's, always filled", () => {
    expect(placeholdersOf("{run_id} {item}", readerOf([])).placeholders).toEqual([
      { name: "run_id", source: "floor", state: "filled", filledBy: [], path: [] },
      { name: "item", source: "floor", state: "filled", filledBy: [], path: [] },
    ]);
  });

  it("reads {git_credential} as the floor's when the station has a git need", () => {
    const reader = readerOf([{ name: "repo", kind: "git" }]);

    expect(placeholdersOf("{git_credential}", reader).placeholders[0]).toMatchObject({ source: "floor", state: "filled" });
  });

  it("is unsupplied for {git_credential} when the station has no git need", () => {
    expect(placeholdersOf("{git_credential}", readerOf([])).placeholders).toEqual([{ name: "git_credential", source: "none", state: "unsupplied", filledBy: [], path: [] }]);
  });

  it("is unsupplied for {ticket} when ticket is a file need, which the prompt reads as {ticket_path}", () => {
    const reader = readerOf([{ name: "ticket", kind: "file" }]);

    expect(placeholdersOf("{ticket}", reader).placeholders).toEqual([{ name: "ticket", source: "none", state: "unsupplied", filledBy: [], path: [] }]);
  });

  it("lets a value need named {run_id} win over the floor's", () => {
    const reader = readerOf([{ name: "run_id", kind: "value" }]);

    expect(placeholdersOf("{run_id}", reader).placeholders[0]).toMatchObject({ source: "value-need" });
  });

  it("follows the bind of the node for a need bound to another name", () => {
    const reader = readerOf([{ name: "ticket", kind: "value" }]);
    const line = diamond({ args: { issue: { kind: "value" } }, nodes: diamond().nodes.map((node) => (node.id === "join" ? { ...node, bind: { ticket: "issue" } } : node)) });

    expect(placeholdersOf("{ticket}", reader, line).placeholders[0]).toMatchObject({ source: "value-need", state: "seeded" });
  });
});

describe("promptPlaceholders, unused", () => {
  it("lists a need the prompt mentions neither as {name} nor as {name_path}", () => {
    const reader = readerOf([{ name: "ticket", kind: "value" }, { name: "plan", kind: "file" }, { name: "spare", kind: "value" }]);

    expect(placeholdersOf("{ticket} {plan_path}", reader).unused).toEqual(["spare"]);
  });

  it("leaves out a need the floor fills", () => {
    expect(placeholdersOf("nothing", readerOf([{ name: "previous_error", kind: "value" }])).unused).toEqual([]);
  });
});
