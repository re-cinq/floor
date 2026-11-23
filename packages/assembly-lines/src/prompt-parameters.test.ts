import { describe, expect, it } from "vitest";
import { BROKER_PARAMETER_NAMES, RUN_PARAMETER_NAMES, declaredParameters, promptParameters, runParameters } from "./prompt-parameters.js";
import type { NeedSpec, ProduceSpec } from "@re-cinq/floor-contracts";

describe("promptParameters", () => {
  it("passes a value need under its own name", () => {
    expect(promptParameters([{ name: "pr_url", kind: "value", value: "https://pr/412" }], [])).toEqual({ pr_url: "https://pr/412" });
  });

  it("gives a file the agent is to produce its full path in the workspace", () => {
    expect(promptParameters([], [{ name: "note", kind: "file", path: "out/note.md" }])).toEqual({ note_path: "/workspace/out/note.md" });
  });

  it("gives a file need the path it was downloaded to", () => {
    const needs = [{ name: "plan", kind: "file" as const, path: "plan.md", url: "http://floor/blobs/sha256-a" }];

    expect(promptParameters(needs, [])).toEqual({ plan_path: "/workspace/plan.md" });
  });

  it("gives a git need the path it was cloned to", () => {
    const needs = [{ name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/re-cinq/lore", ref: "main", access: "read" as const }];

    expect(promptParameters(needs, [])).toEqual({ workspace_path: "/workspace/repo" });
  });

  it("gives no path to a value the agent produces, which has no place", () => {
    expect(promptParameters([], [{ name: "verdict", kind: "value" }])).toEqual({});
  });

  it("lets a value need keep its name when a path would take it", () => {
    const needs = [{ name: "note_path", kind: "value" as const, value: "chosen by the station" }];

    expect(promptParameters(needs, [{ name: "note", kind: "file", path: "note.md" }])).toEqual({ note_path: "chosen by the station" });
  });

  it("path escape: a path that climbs out of the workspace is given to nobody", () => {
    expect(promptParameters([], [{ name: "note", kind: "file", path: "../etc/passwd" }])).toEqual({});
  });
});

describe("declaredParameters", () => {
  it("names a value need under its own name", () => {
    expect(declaredParameters({ needs: [{ name: "pr_url", kind: "value" }], produces: [] })).toEqual([{ name: "pr_url", from: "value-need", source: "pr_url" }]);
  });

  it("names a file need plan_path, at the path it declares or else at its own name", () => {
    const needs: NeedSpec[] = [{ name: "plan", kind: "file", path: "plan.md" }, { name: "notes", kind: "file" }];

    expect(declaredParameters({ needs, produces: [] })).toEqual([
      { name: "plan_path", from: "need-path", source: "plan" },
      { name: "notes_path", from: "need-path", source: "notes" },
    ]);
  });

  it("names a git need workspace_path", () => {
    expect(declaredParameters({ needs: [{ name: "workspace", kind: "git", path: "repo" }], produces: [] })).toEqual([{ name: "workspace_path", from: "need-path", source: "workspace" }]);
  });

  it("names a produce note_path only when it declares a path inside the workspace", () => {
    const produces: ProduceSpec[] = [{ name: "note", kind: "file", path: "out/note.md" }, { name: "verdict", kind: "value" }, { name: "escape", kind: "file", path: "../etc/passwd" }];

    expect(declaredParameters({ needs: [], produces })).toEqual([{ name: "note_path", from: "produce-path", source: "note" }]);
  });

  it("lists paths before values, as promptParameters lets a value need win a name", () => {
    const needs: NeedSpec[] = [{ name: "note_path", kind: "value" }, { name: "plan", kind: "file" }];

    expect(declaredParameters({ needs, produces: [] }).map(({ name }) => name)).toEqual(["plan_path", "note_path"]);
  });

  it("names exactly what promptParameters gives a brief of the same station", () => {
    const station = { needs: [{ name: "pr_url", kind: "value" as const }, { name: "plan", kind: "file" as const, path: "plan.md" }], produces: [{ name: "note", kind: "file" as const, path: "note.md" }] };
    const brief = [{ name: "pr_url", kind: "value" as const, value: "https://pr/412" }, { name: "plan", kind: "file" as const, path: "plan.md", url: "http://floor/blobs/a" }];

    expect(declaredParameters(station).map(({ name }) => name).sort()).toEqual(Object.keys(promptParameters(brief, station.produces)).sort());
  });
});

describe("the floor's own parameters", () => {
  it("lists the names runParameters gives", () => {
    expect([...RUN_PARAMETER_NAMES]).toEqual(Object.keys(runParameters({ runId: "r1", lineId: "l1", nodeId: "n1" })));
  });

  it("lists the two broker parameters", () => {
    expect([...BROKER_PARAMETER_NAMES]).toEqual(["git_credential", "git_credential_url"]);
  });
});
