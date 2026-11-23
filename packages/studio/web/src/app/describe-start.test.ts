import { describe, it, expect } from "vitest";
import { describeStart } from "./describe-start";

describe("describeStart", () => {
  it("says a line with no start of its own starts by API", () => {
    expect(describeStart(undefined)).toEqual({ via: "api" });
  });

  it("lists the events a line starts on, with no conditions when it has no when", () => {
    expect(describeStart({ on: ["pr.opened", "pr.updated"], args: {} })).toEqual({ via: "events", events: ["pr.opened", "pr.updated"], conditions: [] });
  });

  it("writes each when as a field compared with its value", () => {
    expect(describeStart({ on: ["pr.opened"], when: { action: "opened", draft: false, number: 7 }, args: {} })).toEqual({
      via: "events",
      events: ["pr.opened"],
      conditions: ["action = opened", "draft = false", "number = 7"],
    });
  });
});
