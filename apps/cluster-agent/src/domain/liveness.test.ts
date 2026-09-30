import { describe, expect, it } from "vitest";
import type { ClaimTickOutcome } from "../claim-loop.js";
import { LIVENESS_LOG_INTERVAL_MS, describeClaimTick, dueForLivenessLog } from "./liveness.js";

describe("dueForLivenessLog", () => {
  it("is due on the very first tick, with no prior log", () => {
    expect(dueForLivenessLog(null, 1_000, LIVENESS_LOG_INTERVAL_MS)).toBe(true);
  });

  it("is not due a second before the interval has passed", () => {
    expect(dueForLivenessLog(0, LIVENESS_LOG_INTERVAL_MS - 1_000, LIVENESS_LOG_INTERVAL_MS)).toBe(false);
  });

  it("is due once the interval has passed exactly", () => {
    expect(dueForLivenessLog(0, LIVENESS_LOG_INTERVAL_MS, LIVENESS_LOG_INTERVAL_MS)).toBe(true);
  });
});

describe("describeClaimTick", () => {
  it("says idle for a tick that claimed nothing", () => {
    expect(describeClaimTick([])).toBe("idle, claimed nothing");
  });

  it("names one dispatched outcome", () => {
    const outcomes: ClaimTickOutcome[] = [{ kind: "dispatched", visitId: "v1" }];

    expect(describeClaimTick(outcomes)).toBe("claimed 1 (dispatched)");
  });

  it("names two outcomes of different kinds in tick order", () => {
    const outcomes: ClaimTickOutcome[] = [{ kind: "dispatched", visitId: "v1" }, { kind: "aborted", visitId: "v2" }];

    expect(describeClaimTick(outcomes)).toBe("claimed 2 (dispatched, aborted)");
  });
});
