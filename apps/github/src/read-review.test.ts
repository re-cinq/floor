import { describe, expect, it } from "vitest";
import type { Brief } from "@floor/station";
import { GIVEN_TOKEN } from "./fake-github.js";
import { fixedToken } from "./github-auth.js";
import { readReviewStation } from "./read-review.js";
import { githubFixture, PULL_REQUEST, toolsReading } from "./test-support.js";

const github = githubFixture();

function reported(needs: Partial<Record<"pr_url" | "review_id" | "intent", string>> = {}) {
  const station = readReviewStation({ apiUrl: github.apiUrl, tokenFor: fixedToken(GIVEN_TOKEN) });

  return station(visit(needs), toolsReading(""));
}

function visit(needs: Partial<Record<"pr_url" | "review_id" | "intent", string>>): Brief {
  return { visitId: "v1", iteration: 1, needs: { pr_url: PULL_REQUEST, review_id: "900", intent: "address", ...needs } };
}

describe("the read-review station", () => {
  it("asks the pull request, the review and its comments", async () => {
    await reported();

    expect(github.asked).toEqual(
      expect.arrayContaining([
        "GET /repos/re-cinq/floor/pulls/12",
        "GET /repos/re-cinq/floor/pulls/12/reviews/900",
        "GET /repos/re-cinq/floor/pulls/12/reviews/900/comments?per_page=100&page=1",
      ]),
    );
  });

  it("turns a review's body and inline comments into the reply agent's task", async () => {
    github.fixtures.branch = "feature/x";
    github.fixtures.reviewBody = "guard the null case";
    github.fixtures.reviewComments = [{ id: 11, path: "src/a.ts", line: 7, body: "null here" }];

    const report = await reported();

    expect(report).toEqual({
      outcome: "success",
      produced: {
        review_feedback: expect.stringContaining(
          "On pull request #12 in re-cinq/floor (branch feature/x), a human commented: guard the null case\n\nInline comments:\n- inline comment 11 on src/a.ts:7: null here",
        ),
      },
    });
  });

  it("reads the 101st inline comment of a long review, which GitHub gives on a second page", async () => {
    github.fixtures.reviewComments = Array.from({ length: 101 }, (unused, index) => ({ id: index + 1, path: "src/a.ts", line: index + 1, body: `finding ${index + 1}` }));

    const report = await reported();

    expect(report.produced?.review_feedback).toContain("- inline comment 101 on src/a.ts:101: finding 101");
  });

  it("tells the agent to only answer when the intent is answer", async () => {
    github.fixtures.reviewBody = "why this way?";
    github.fixtures.reviewComments = [];

    const report = await reported({ intent: "answer" });

    expect(report.produced?.review_feedback).toContain("Answer their question briefly in the review thread; do not change code.");
  });

  it("falls back to a fixed sentence when the review carried no text", async () => {
    github.fixtures.reviewBody = null;
    github.fixtures.reviewComments = [];

    const report = await reported();

    expect(report.produced?.review_feedback).toContain("a human commented: changes requested in a submitted review");
  });

  it("fails the visit on an address that is no pull request's", async () => {
    const report = await reported({ pr_url: "https://github.com/re-cinq/floor/issues/12" });

    expect(report.error).toBe('"https://github.com/re-cinq/floor/issues/12" is not a pull request\'s address');
  });

  it("throws when GitHub refuses the token", async () => {
    const station = readReviewStation({ apiUrl: github.apiUrl, tokenFor: fixedToken("bad-token") });

    await expect(station(visit({}), toolsReading(""))).rejects.toThrow(/GitHub answered 401/);
  });
});
