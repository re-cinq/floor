import { describe, expect, it } from "vitest";
import type { Brief } from "@floor/station";
import { GIVEN_TOKEN } from "./fake-github.js";
import { fixedToken } from "./github-auth.js";
import { postReplyStation } from "./post-reply.js";
import { githubFixture, PULL_REQUEST, toolsReading } from "./test-support.js";

const github = githubFixture();
const REPLY_BODY = "Fixed in a1b2c3d — the guard is now first.";

function replied(said: string, prUrl = PULL_REQUEST, visitId = "v1") {
  const station = postReplyStation({ apiUrl: github.apiUrl, tokenFor: fixedToken(GIVEN_TOKEN) });

  return station(visit(prUrl, visitId), toolsReading(said));
}

function visit(prUrl: string, visitId: string): Brief {
  return { visitId, iteration: 1, needs: { pr_url: prUrl, reply_output: "/blobs/sha256-x" } };
}

function printed(body: string): string {
  return `\`\`\`REVIEW_REPLY\n${body}\n\`\`\``;
}

describe("the post-reply station", () => {
  it("posts the reply as a plain comment on the pull request", async () => {
    await replied(printed(REPLY_BODY), PULL_REQUEST, "posts-a-comment");

    expect(github.asked).toContain("POST /repos/re-cinq/floor/issues/12/comments");
  });

  it("leads the comment with a marker naming the visit", async () => {
    await replied(printed(REPLY_BODY), PULL_REQUEST, "leads-with-marker");

    expect(github.issueComments.at(-1)).toMatchObject({ body: `<!-- floor-reply: leads-with-marker -->\n\n${REPLY_BODY}\n\n<sub>Posted by floor, visit leads-with-marker.</sub>` });
  });

  it("reports where the reply can be read", async () => {
    const report = await replied(printed(REPLY_BODY), PULL_REQUEST, "reports-the-url");

    expect(report).toEqual({ outcome: "success", produced: { reply_url: expect.stringContaining("#issuecomment-") } });
  });

  it("posts nothing for a visit already replied to", async () => {
    github.issueComments.push({ body: "<!-- floor-reply: already-replied -->\n\nSaid already.", html_url: "https://github.com/re-cinq/floor/issues/12#issuecomment-1" });
    const before = github.issueComments.length;

    const report = await replied(printed(REPLY_BODY), PULL_REQUEST, "already-replied");

    expect({ report, posted: github.issueComments.length - before }).toEqual({
      report: { outcome: "success", produced: { reply_url: "https://github.com/re-cinq/floor/issues/12#issuecomment-1" } },
      posted: 0,
    });
  });

  it("posts nothing for a visit whose reply is the 101st comment, on GitHub's second page", async () => {
    const chatter = Array.from({ length: 100 }, (unused, index) => ({ body: `comment ${index + 1}`, html_url: `https://github.com/re-cinq/floor/issues/12#chatter-${index + 1}` }));

    github.issueComments.unshift(...chatter);
    github.issueComments.push({ body: "<!-- floor-reply: far-down -->\n\nSaid already.", html_url: "https://github.com/re-cinq/floor/issues/12#issuecomment-far" });
    const before = github.issueComments.length;

    await replied(printed(REPLY_BODY), PULL_REQUEST, "far-down");

    expect(github.issueComments.length - before).toBe(0);
  });

  it("fails the visit on output with no REVIEW_REPLY block", async () => {
    const report = await replied("REVIEW_RESULT:APPROVED");

    expect(report).toEqual({ outcome: "failed", error: "the reply has no REVIEW_REPLY block" });
  });

  it("fails the visit on an empty REVIEW_REPLY block", async () => {
    const report = await replied("```REVIEW_REPLY\n   \n```");

    expect(report).toEqual({ outcome: "failed", error: "the reply has no REVIEW_REPLY block" });
  });

  it("fails the visit on an address that is no pull request's", async () => {
    const report = await replied(printed(REPLY_BODY), "https://github.com/re-cinq/floor/issues/12");

    expect(report.error).toBe('"https://github.com/re-cinq/floor/issues/12" is not a pull request\'s address');
  });
});
