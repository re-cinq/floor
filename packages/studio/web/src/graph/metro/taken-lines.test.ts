import { describe, expect, it } from "vitest";
import { codeReviewDefinition, implementationDefinition } from "../definition.fixtures";
import { takenLinesOf } from "./taken-lines";

describe("takenLinesOf", () => {
  it("returns no taken lines when the run has no visits", () => {
    expect(takenLinesOf(codeReviewDefinition, [])).toEqual(new Map());
  });

  it("counts the review to done success edge once for a finished review visit with outcome success", () => {
    const visits = [{ nodeId: "review", iteration: 1, outcome: "success", open: false }];

    expect(takenLinesOf(codeReviewDefinition, visits)).toEqual(new Map([["review|done|success", 1]]));
  });

  it("counts the review to done failed edge once for a finished review visit with outcome agent-failed", () => {
    const visits = [{ nodeId: "review", iteration: 1, outcome: "agent-failed", open: false }];

    expect(takenLinesOf(codeReviewDefinition, visits)).toEqual(new Map([["review|done|failed", 1]]));
  });

  it("counts the push to review always edge once for a finished push visit with outcome success", () => {
    const visits = [{ nodeId: "push", iteration: 1, outcome: "success", open: false }];

    expect(takenLinesOf(implementationDefinition, visits)).toEqual(new Map([["push|review|always", 1]]));
  });

  it("returns no taken lines for an open push visit despite its always edge", () => {
    const visits = [{ nodeId: "push", iteration: 1, open: true }];

    expect(takenLinesOf(implementationDefinition, visits)).toEqual(new Map());
  });
});
