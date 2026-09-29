import { describe, expect, it } from "vitest";
import { promptParameters } from "./prompt-parameters.js";

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
