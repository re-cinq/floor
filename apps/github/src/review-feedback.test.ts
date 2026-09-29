import { describe, expect, it } from "vitest";
import { replyDescription, reviewFeedback, reviewSubmittedFeedback } from "./review-feedback.js";

describe("reviewFeedback", () => {
  it("composes the body with inline comments carrying ids and locations", () => {
    expect(
      reviewFeedback("please tighten this up", [
        { id: 11, path: "src/a.ts", line: 7, body: "guard the null case" },
        { id: 12, path: "src/b.ts", line: null, body: "typo in the doc" },
      ]),
    ).toBe(
      "please tighten this up\n\nInline comments:\n" +
        "- inline comment 11 on src/a.ts:7: guard the null case\n" +
        "- inline comment 12 on src/b.ts: typo in the doc",
    );
  });

  it("returns an empty string for a review with neither body nor comments", () => {
    expect(reviewFeedback("", [])).toBe("");
  });

  it("keeps the inline-comments header when the review has no body", () => {
    expect(reviewFeedback("", [{ id: 11, path: "src/a.ts", line: 7, body: "guard the null case" }])).toBe(
      "Inline comments:\n- inline comment 11 on src/a.ts:7: guard the null case",
    );
  });
});

describe("reviewSubmittedFeedback", () => {
  it("falls back to a fixed sentence when the review carried no text", () => {
    expect(reviewSubmittedFeedback(undefined, [])).toBe("changes requested in a submitted review");
  });

  it("passes through the composed feedback when there is any", () => {
    expect(reviewSubmittedFeedback("please tighten this up", [])).toBe("please tighten this up");
  });
});

describe("replyDescription", () => {
  it("tells the agent to implement and push for an address intent", () => {
    expect(replyDescription("address", { repo: "re-cinq/floor", prNumber: 42, branch: "feature/x", commentBody: "guard the null" })).toBe(
      "On pull request #42 in re-cinq/floor (branch feature/x), a human commented: guard the null\n\n" +
        "They approved a fix — implement it and commit to the PR branch, then confirm briefly in the thread.",
    );
  });

  it("tells the agent to only answer for an answer intent", () => {
    expect(replyDescription("answer", { repo: "re-cinq/floor", prNumber: 42, branch: "feature/x", commentBody: "why this way?" })).toBe(
      "On pull request #42 in re-cinq/floor (branch feature/x), a human commented: why this way?\n\n" +
        "Answer their question briefly in the review thread; do not change code.",
    );
  });

  it("names the thread when the comment replies to one", () => {
    expect(
      replyDescription("answer", { repo: "re-cinq/floor", prNumber: 42, branch: "feature/x", commentBody: "why?", inReplyToId: 5 }),
    ).toContain("(branch feature/x) (reply on review-comment thread 5), a human commented: why?");
  });
});
