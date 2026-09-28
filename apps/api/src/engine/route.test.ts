import { describe, expect, it } from "vitest";
import { routeEvent } from "./route.js";

const RUN_ID = "0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01";
const VISIT_ID = "5c2a9b1e-3d4f-4c6a-8b7e-9f0a1b2c3d4e";

describe("routeEvent", () => {
  it("routes station_run.reported to a report on its visit", () => {
    const route = routeEvent({ name: "station_run.reported", payload: { visitId: VISIT_ID, report: { outcome: "success" } } });

    expect(route).toEqual({ kind: "report", visitId: VISIT_ID, report: { outcome: "success" } });
  });

  it("refuses station_run.reported with no outcome", () => {
    const route = routeEvent({ name: "station_run.reported", payload: { visitId: VISIT_ID, report: {} } });

    expect(route.kind).toBe("invalid");
  });

  it("routes a walk-posted node start with its iteration", () => {
    const route = routeEvent({ name: "node.review.start", payload: { runId: RUN_ID, nodeId: "review", iteration: 2 } });

    expect(route).toEqual({ kind: "run-event", run: { runId: RUN_ID }, iteration: 2 });
  });

  it("routes a start posted by a person with who asked and no iteration", () => {
    const route = routeEvent({ name: "manual.plan.validate", payload: { runId: RUN_ID, requestedBy: "ana" } });

    expect(route).toEqual({ kind: "run-event", run: { runId: RUN_ID }, requestedBy: "ana" });
  });

  it("refuses a run id that is not a uuid", () => {
    const route = routeEvent({ name: "node.review.start", payload: { runId: "42" } });

    expect(route.kind).toBe("invalid");
  });

  it("routes an event naming a subject and its repo to the run holding it", () => {
    const route = routeEvent({ name: "github.pull_request.closed", payload: { subjectKey: "pr_url:u", repo: "r", merged: true } });

    expect(route).toEqual({ kind: "run-event", run: { subjectKey: "pr_url:u", repo: "r" } });
  });

  it("refuses a subject with no repo to look for it on", () => {
    const route = routeEvent({ name: "github.pull_request.closed", payload: { subjectKey: "pr_url:u" } });

    expect(route.kind).toBe("invalid");
  });

  it("treats an event naming no run as one from outside", () => {
    const route = routeEvent({ name: "github.pull_request.opened", payload: { repository: "r" } });

    expect(route).toEqual({ kind: "outside" });
  });

  it("treats internal.run.settled as one from outside, though it names a run", () => {
    const route = routeEvent({ name: "internal.run.settled", payload: { runId: RUN_ID, outcome: "success" } });

    expect(route).toEqual({ kind: "outside" });
  });
});
