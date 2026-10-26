import { describe, expect, it } from "vitest";
import { readAgentVerdict } from "./agent-verdict.js";

const OUTCOMES = ["success", "changes_requested", "needs_human"];

describe("readAgentVerdict", () => {
  it("defaults to success when the agent printed no marker", () => {
    expect(readAgentVerdict("All done.", OUTCOMES)).toEqual({ outcome: "success", produced: {}, spoke: "nothing" });
  });

  it("defaults to success for no output at all", () => {
    expect(readAgentVerdict(undefined, OUTCOMES)).toEqual({ outcome: "success", produced: {}, spoke: "nothing" });
  });

  it("reads a bare-word marker", () => {
    expect(readAgentVerdict("LORE_NODE_RESULT: changes_requested", OUTCOMES).outcome).toBe("changes_requested");
  });

  it("reads an outcome only this station declares", () => {
    expect(readAgentVerdict("LORE_NODE_RESULT: needs_human", OUTCOMES).outcome).toBe("needs_human");
  });

  it("reads failed though the station does not declare it", () => {
    expect(readAgentVerdict("LORE_NODE_RESULT: failed", OUTCOMES).outcome).toBe("failed");
  });

  it("reads a JSON marker with what it produced", () => {
    const output = 'LORE_NODE_RESULT: {"outcome":"success","produced":{"review_verdict":"approved"}}';

    expect(readAgentVerdict(output, OUTCOMES)).toEqual({ outcome: "success", produced: { review_verdict: "approved" }, spoke: "marker" });
  });

  it("reads lore's extras as what was produced", () => {
    const output = 'LORE_NODE_RESULT: {"outcome":"success","extras":{"Lore-Pr-Url":"https://pr/1"}}';

    expect(readAgentVerdict(output, OUTCOMES).produced).toEqual({ "Lore-Pr-Url": "https://pr/1" });
  });

  it("drops a produced value that is not text", () => {
    const output = 'LORE_NODE_RESULT: {"outcome":"success","produced":{"count":3,"name":"x"}}';

    expect(readAgentVerdict(output, OUTCOMES).produced).toEqual({ name: "x" });
  });

  it("takes the last marker when the agent printed several", () => {
    const output = "LORE_NODE_RESULT: success\nOn reflection:\nLORE_NODE_RESULT: changes_requested";

    expect(readAgentVerdict(output, OUTCOMES).outcome).toBe("changes_requested");
  });

  it("ignores a marker quoted mid-sentence", () => {
    expect(readAgentVerdict("I will print LORE_NODE_RESULT: failed when done.", OUTCOMES).outcome).toBe("success");
  });

  it("fails on an outcome the station does not declare, quoting the line", () => {
    expect(readAgentVerdict("LORE_NODE_RESULT: approved", OUTCOMES)).toEqual({
      outcome: "failed",
      produced: {},
      error: "unparseable LORE_NODE_RESULT line: LORE_NODE_RESULT: approved",
      spoke: "marker",
    });
  });

  it("fails on a marker holding broken JSON", () => {
    expect(readAgentVerdict('LORE_NODE_RESULT: {"outcome":', OUTCOMES).outcome).toBe("failed");
  });

  it("caps the error it quotes at 300 characters", () => {
    const verdict = readAgentVerdict(`LORE_NODE_RESULT: ${"x".repeat(500)}`, OUTCOMES);

    expect(verdict.error).toHaveLength(300);
  });

  it("falls back to REVIEW_RESULT when there is no marker", () => {
    expect(readAgentVerdict("REVIEW_RESULT: CHANGES_REQUESTED", OUTCOMES).outcome).toBe("changes_requested");
  });

  it("reads REVIEW_RESULT: APPROVED as success", () => {
    expect(readAgentVerdict("REVIEW_RESULT: APPROVED", OUTCOMES).outcome).toBe("success");
  });

  it("prefers the marker over REVIEW_RESULT", () => {
    const output = "REVIEW_RESULT: CHANGES_REQUESTED\nLORE_NODE_RESULT: success";

    expect(readAgentVerdict(output, OUTCOMES).outcome).toBe("success");
  });

  it("says whether the agent spoke a marker at all, so silence is not mistaken for a chosen success", () => {
    expect([readAgentVerdict("done, nothing to add", ["success"]).spoke, readAgentVerdict("LORE_NODE_RESULT: success", ["success"]).spoke]).toEqual(["nothing", "marker"]);
  });

  it("says the agent spoke a review verdict when it printed REVIEW_RESULT: APPROVED and no marker", () => {
    expect(readAgentVerdict("REVIEW_RESULT: APPROVED", OUTCOMES)).toEqual({ outcome: "success", produced: {}, spoke: "review" });
  });

  it("says the agent spoke a review verdict for REVIEW_RESULT: CHANGES_REQUESTED", () => {
    expect(readAgentVerdict("Two findings.\nREVIEW_RESULT: CHANGES_REQUESTED", OUTCOMES).spoke).toBe("review");
  });

  it("says the agent spoke nothing when its output stops at REVIEW_RESULT: with no verdict after it", () => {
    expect(readAgentVerdict('{"findings": [\nREVIEW_RESULT:', OUTCOMES).spoke).toBe("nothing");
  });

  it("says the agent spoke a marker when it printed both a marker and REVIEW_RESULT", () => {
    expect(readAgentVerdict("REVIEW_RESULT: CHANGES_REQUESTED\nLORE_NODE_RESULT: success", OUTCOMES).spoke).toBe("marker");
  });
});
