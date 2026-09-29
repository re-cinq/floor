import { describe, expect, it } from "vitest";
import { floorEventOf } from "./floor-event.js";

const REPOSITORY = { full_name: "re-cinq/floor" };
const SENDER = { login: "bogdan" };

const OPENED = {
  action: "opened",
  number: 12,
  repository: REPOSITORY,
  sender: SENDER,
  pull_request: {
    number: 12,
    html_url: "https://github.com/re-cinq/floor/pull/12",
    title: "Add the sweeper",
    draft: false,
    merged: false,
    head: { ref: "sweeper", sha: "9e1f" },
    base: { ref: "main" },
  },
};

const COMMENTED = {
  action: "created",
  repository: REPOSITORY,
  sender: SENDER,
  issue: { number: 12, pull_request: { html_url: "https://github.com/re-cinq/floor/pull/12" } },
  comment: { id: 99, body: "please rename this", html_url: "https://github.com/re-cinq/floor/pull/12#issuecomment-99" },
};

const REVIEWED = {
  action: "submitted",
  repository: REPOSITORY,
  sender: { login: "bogdan", type: "User" },
  pull_request: OPENED.pull_request,
  review: { id: 501, state: "changes_requested", body: null, html_url: "https://github.com/re-cinq/floor/pull/12#pullrequestreview-501", author_association: "MEMBER" },
};

function eventOf(event: string, body: unknown) {
  return floorEventOf({ event, id: "delivery-1", body });
}

describe("floorEventOf", () => {
  it("names the event after GitHub's event and action", () => {
    expect(eventOf("pull_request", OPENED)?.name).toBe("github.pull_request.opened");
  });

  it("names an event with no action after the event alone", () => {
    expect(eventOf("push", { repository: REPOSITORY, sender: SENDER })?.name).toBe("github.push");
  });

  it("lifts what a line's start may name out of GitHub's nesting", () => {
    expect(eventOf("pull_request", OPENED)?.payload).toEqual({
      repository: "github.com/re-cinq/floor",
      repo: "github.com/re-cinq/floor",
      sender: "bogdan",
      action: "opened",
      pull_request_url: "https://github.com/re-cinq/floor/pull/12",
      subjectKey: "pr_url:https://github.com/re-cinq/floor/pull/12",
      number: 12,
      title: "Add the sweeper",
      draft: false,
      merged: false,
      head_ref: "sweeper",
      head_sha: "9e1f",
      base_ref: "main",
    });
  });

  it("is the same event when GitHub delivers it again", () => {
    expect(eventOf("pull_request", OPENED)?.dedupeKey).toBe("github:delivery-1");
  });

  it("finds the pull request a comment is on, and carries what was said", () => {
    expect(eventOf("issue_comment", COMMENTED)?.payload).toMatchObject({
      subjectKey: "pr_url:https://github.com/re-cinq/floor/pull/12",
      comment_id: 99,
      comment_body: "please rename this",
    });
  });

  it("gives a comment on a plain issue no subject, since no run is about it", () => {
    const onIssue = { ...COMMENTED, issue: { number: 3 } };

    expect(eventOf("issue_comment", onIssue)?.payload).toEqual({ repository: "github.com/re-cinq/floor", repo: "github.com/re-cinq/floor", sender: "bogdan", action: "created" });
  });

  it("is nothing for a ping, which names no repository", () => {
    expect(eventOf("ping", { zen: "Keep it logically awesome." })).toBeNull();
  });

  it("is nothing for a body that was not JSON", () => {
    expect(eventOf("pull_request", null)).toBeNull();
  });

  it("tells a review as its pull request, with the review beside it", () => {
    expect(eventOf("pull_request_review", REVIEWED)?.payload).toMatchObject({
      pull_request_url: "https://github.com/re-cinq/floor/pull/12",
      subjectKey: "pr_url:https://github.com/re-cinq/floor/pull/12",
      number: 12,
      head_ref: "sweeper",
      draft: false,
      review_id: 501,
      review_state: "changes_requested",
      review_url: "https://github.com/re-cinq/floor/pull/12#pullrequestreview-501",
    });
  });

  it("says a person sent it, so a line may refuse what a bot sent", () => {
    expect(eventOf("pull_request_review", REVIEWED)?.payload.sender_type).toBe("User");
  });

  it("trusts a review by a member of the organisation", () => {
    expect(eventOf("pull_request_review", REVIEWED)?.payload.sender_trusted).toBe(true);
  });

  it("stranger: does not trust a review by someone with no part in the repository", () => {
    const strangers = { ...REVIEWED, review: { ...REVIEWED.review, author_association: "NONE" } };

    expect(eventOf("pull_request_review", strangers)?.payload.sender_trusted).toBe(false);
  });

  it("stranger: does not trust a review that says nothing of who wrote it", () => {
    const unsigned = { id: 501, state: "changes_requested", html_url: REVIEWED.review.html_url };

    expect(eventOf("pull_request_review", { ...REVIEWED, review: unsigned })?.payload.sender_trusted).toBe(false);
  });

  it("says a bot sent it", () => {
    const posted = { ...REVIEWED, sender: { login: "lore-agent[bot]", type: "Bot" } };

    expect(eventOf("pull_request_review", posted)?.payload.sender_type).toBe("Bot");
  });
});
