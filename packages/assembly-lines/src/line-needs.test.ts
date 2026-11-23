import { describe, expect, it } from "vitest";
import { validateLine } from "./line-validation.js";
import type { KnownDefinitions } from "./line-validation.js";
import type { LineBody, StationBody } from "./types.js";

function station(outcomes: string[], needs: StationBody["needs"], produces: StationBody["produces"] = []): StationBody {
  return { kind: "agent", outcomes, needs, produces };
}

function pushLine(args: LineBody["args"]): LineBody {
  return {
    entry: "push",
    exit: "done",
    args,
    nodes: [{ id: "push", station: "pusher" }, { id: "done" }],
    edges: [{ from: "push", to: "done", on: "success" }],
  };
}

function pusherKnown(): KnownDefinitions {
  return { stations: new Set(["pusher"]), bodies: new Map([["pusher", station(["success"], [{ name: "repo", kind: "git", access: "write" }])]]) };
}

describe("validateLine, needs coverage", () => {
  it("accepts a need seeded directly by a line argument", () => {
    const line: LineBody = {
      entry: "work",
      exit: "done",
      args: { description: { kind: "value" } },
      nodes: [{ id: "work", station: "worker" }, { id: "done" }],
      edges: [{ from: "work", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", station(["success"], [{ name: "description", kind: "value" }])]]) };

    expect(validateLine(line, known)).toEqual([]);
  });

  it("accepts a need produced by an earlier node on the only path into it", () => {
    const line: LineBody = {
      entry: "producer",
      exit: "done",
      args: {},
      nodes: [{ id: "producer", station: "producer" }, { id: "consumer", station: "consumer" }, { id: "done" }],
      edges: [{ from: "producer", to: "consumer", on: "success" }, { from: "consumer", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = {
      stations: new Set(["producer", "consumer"]),
      bodies: new Map([
        ["producer", station(["success"], [], [{ name: "artifact", kind: "value" }])],
        ["consumer", station(["success"], [{ name: "artifact", kind: "value" }])],
      ]),
    };

    expect(validateLine(line, known)).toEqual([]);
  });

  it("reports a need produced only on one branch of a diamond", () => {
    const line: LineBody = {
      entry: "start",
      exit: "done",
      args: {},
      nodes: [
        { id: "start", station: "start" },
        { id: "a", station: "a" },
        { id: "b", station: "b" },
        { id: "join", station: "join" },
        { id: "done" },
      ],
      edges: [
        { from: "start", to: "a", on: "success" },
        { from: "start", to: "b", on: "changes_requested" },
        { from: "a", to: "join", on: "success" },
        { from: "b", to: "join", on: "success" },
        { from: "join", to: "done", on: "success" },
      ],
    };
    const known: KnownDefinitions = {
      stations: new Set(["start", "a", "b", "join"]),
      bodies: new Map([
        ["start", station(["success", "changes_requested"], [])],
        ["a", station(["success"], [], [{ name: "artifact", kind: "value" }])],
        ["b", station(["success"], [])],
        ["join", station(["success"], [{ name: "artifact", kind: "value" }])],
      ]),
    };

    expect(validateLine(line, known)).toEqual([`node "join" needs "artifact", which is not seeded at start and not produced on every path into it`]);
  });

  it("reports a need only a back edge would ever produce", () => {
    const line: LineBody = {
      entry: "consumer",
      exit: "done",
      args: {},
      nodes: [{ id: "consumer", station: "consumer" }, { id: "producer", station: "producer" }, { id: "done" }],
      edges: [
        { from: "consumer", to: "producer", on: "success" },
        { from: "producer", to: "consumer", on: "failed", iterationMax: 1 },
        { from: "producer", to: "done", on: "success" },
      ],
    };
    const known: KnownDefinitions = {
      stations: new Set(["consumer", "producer"]),
      bodies: new Map([
        ["consumer", station(["success"], [{ name: "artifact", kind: "value" }])],
        ["producer", station(["success", "failed"], [], [{ name: "artifact", kind: "value" }])],
      ]),
    };

    expect(validateLine(line, known)).toEqual([`node "consumer" needs "artifact", which is not seeded at start and not produced on every path into it`]);
  });

  it("reports a custom-start node's unseeded need even though another node produces that name", () => {
    const line: LineBody = {
      entry: "producer",
      exit: "done",
      args: {},
      nodes: [
        { id: "producer", station: "producer" },
        { id: "notify", station: "notifier", start: "manual.line.notify" },
        { id: "done" },
      ],
      edges: [{ from: "producer", to: "done", on: "success" }, { from: "notify", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = {
      stations: new Set(["producer", "notifier"]),
      bodies: new Map([
        ["producer", station(["success"], [], [{ name: "diff", kind: "value" }])],
        ["notifier", station(["success"], [{ name: "diff", kind: "value" }])],
      ]),
    };

    expect(validateLine(line, known)).toEqual([`node "notify" starts by its own event, so its need "diff" must be seeded at start`]);
  });

  it("reports a git-kind need nothing in the line seeds", () => {
    expect(validateLine(pushLine({}), pusherKnown())).toEqual([`node "push" needs "repo" as kind "git", which nothing in the line seeds`]);
  });

  it("keeps a git-kind need covered when the line seeds it", () => {
    expect(validateLine(pushLine({ repo: { kind: "git" } }), pusherKnown())).toEqual([]);
  });

  it("skips every one of the three new checks for a station pinned by hash", () => {
    const line: LineBody = {
      entry: "loop",
      exit: "done",
      args: {},
      nodes: [{ id: "loop", station: "reviewer@abc123" }, { id: "done" }],
      edges: [{ from: "loop", to: "loop", on: "failed" }, { from: "loop", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = {
      stations: new Set(["reviewer"]),
      bodies: new Map([["reviewer", station(["success", "changes_requested", "failed"], [{ name: "secret", kind: "value" }])]]),
    };

    expect(validateLine(line, known)).toEqual([]);
  });

  it("runs only the pre-existing checks when bodies is absent entirely", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "reviewer" }, { id: "stray" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    };

    expect(validateLine(line, { stations: new Set(["reviewer"]) })).toEqual([`node "stray" has no outgoing edge`, `node "stray" is not reachable from entry "review"`]);
  });
});
