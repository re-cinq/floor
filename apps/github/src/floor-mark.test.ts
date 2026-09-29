import { describe, expect, it } from "vitest";
import { markOf, signed } from "./floor-mark.js";

describe("markOf", () => {
  it("names what was posted and the visit v1 that posted it, out of a reader's sight", () => {
    expect(markOf("review", "v1")).toBe("<!-- floor-review: v1 -->");
  });

  it("tells a reply from a review of the same visit", () => {
    expect(markOf("reply", "v1")).toBe("<!-- floor-reply: v1 -->");
  });
});

describe("signed", () => {
  it("leads with the mark, and ends by saying in plain words that floor posted it", () => {
    expect(signed("review", "v1", "**approved**: fine")).toBe("<!-- floor-review: v1 -->\n\n**approved**: fine\n\n<sub>Posted by floor, visit v1.</sub>");
  });
});
