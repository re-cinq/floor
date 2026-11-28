import { describe, expect, it } from "vitest";
import { filledFrom } from "./bag-at-start";

const pullRequestStart = { on: ["pull_request.opened"], args: { pr_url: "{pull_request.html_url}" } };
const twoEventStart = {
  on: ["pull_request.opened", "pull_request.synchronize"],
  args: { head_sha: "{pull_request.head.sha}" },
};

describe("filledFrom", () => {
  it.each([
    ["pr_url filled by pull_request.opened", pullRequestStart, "pr_url", ["pull_request.opened: {pull_request.html_url}"]],
    ["a dash for repo, which the event does not fill", pullRequestStart, "repo", ["pull_request.opened: —"]],
    [
      "one entry per event for head_sha on two events",
      twoEventStart,
      "head_sha",
      ["pull_request.opened: {pull_request.head.sha}", "pull_request.synchronize: {pull_request.head.sha}"],
    ],
    ["by API for topic without a start", undefined, "topic", ["by API"]],
  ])("returns %s", (outcome, start, name, expected) => {
    expect(filledFrom(start, name)).toEqual(expected);
  });
});
