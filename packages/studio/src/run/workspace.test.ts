import type { StationBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { workspaceOf } from "./workspace.js";

const agentStation: StationBody = { kind: "agent", outcomes: [], needs: [], produces: [] };
const planNeed: StationBody["needs"][number] = { name: "plan", kind: "file", path: "plan.md" };
const stationNeeding = (needs: StationBody["needs"]): StationBody => ({ ...agentStation, needs });

describe("workspaceOf", () => {
  it("copies a file need to its path under the folder and fills plan_path", () => {
    const station = stationNeeding([planNeed]);

    expect(workspaceOf({ station, fixture: { plan: "/home/me/plan.md" }, folder: "/tmp/run-1" })).toMatchObject({
      copies: [{ need: "plan", from: "/home/me/plan.md", to: "/tmp/run-1/plan.md" }],
      parameters: { plan_path: "/tmp/run-1/plan.md" },
    });
  });

  it("fills ticket with ENG-1 and copies nothing for a value need", () => {
    const station = stationNeeding([{ name: "ticket", kind: "value" }, planNeed]);

    expect(workspaceOf({ station, fixture: { ticket: "ENG-1", plan: "/home/me/plan.md" }, folder: "/tmp/run-1" })).toEqual({
      copies: [{ need: "plan", from: "/home/me/plan.md", to: "/tmp/run-1/plan.md" }],
      links: [],
      missing: [],
      parameters: { plan_path: "/tmp/run-1/plan.md", ticket: "ENG-1" },
    });
  });

  it("links the repo checkout at target and fills repo_path for a git need", () => {
    const station = stationNeeding([{ name: "repo", kind: "git", path: "target" }]);

    expect(workspaceOf({ station, fixture: { repo: "/home/me/code/app" }, folder: "/tmp/run-1" })).toMatchObject({
      copies: [],
      links: [{ need: "repo", from: "/home/me/code/app", to: "/tmp/run-1/target" }],
      parameters: { repo_path: "/tmp/run-1/target" },
    });
  });

  it("places nothing and lists plan and ticket as missing when a required need has no fixture entry and an optional one is skipped", () => {
    const station = stationNeeding([planNeed, { name: "notes", kind: "file", path: "notes.md", optional: true }, { name: "ticket", kind: "value" }]);

    expect(workspaceOf({ station, fixture: {}, folder: "/tmp/run-1" })).toMatchObject({ copies: [], missing: ["plan", "ticket"] });
  });

  it("fills report_path under the folder for a produce with a path and nothing for a produce without one", () => {
    const station: StationBody = {
      ...agentStation,
      produces: [
        { name: "report", kind: "file", path: "out/report.md" },
        { name: "verdict", kind: "value" },
      ],
    };

    expect(workspaceOf({ station, fixture: {}, folder: "/tmp/run-1" })).toEqual({
      copies: [],
      links: [],
      missing: [],
      parameters: { report_path: "/tmp/run-1/out/report.md" },
    });
  });
});
