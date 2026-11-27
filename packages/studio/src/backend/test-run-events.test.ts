import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { endOf, jsonLinesIn, RUN_FOLDER, startReviewLoopOnTides, withTestRunSetup, WRITES_DRAFT, type TestRunSetup } from "./test-run-session.fixtures.js";
import { EVENT_REVIEW_COLLECTION } from "./test-run.fixtures.js";

async function startIdleAtReview(setup: TestRunSetup) {
  const session = await startReviewLoopOnTides(setup);

  await session.idle();

  return session;
}

function timelineEntriesWithoutTime({ workspace }: TestRunSetup): Record<string, unknown>[] {
  const entries = jsonLinesIn(join(workspace, RUN_FOLDER, "timeline.jsonl")) as Record<string, unknown>[];

  return entries.map((entry) => ({ ...entry, "at": undefined }));
}

describe("event", () => {
  it("answers nothing and records event_received for review.answered with decision rejected, which matches no waiting node", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startIdleAtReview(setup);

      const { answered } = await session.event({ name: "review.answered", payload: { decision: "rejected" } });
      const { status, visits } = session.state();
      const entries = timelineEntriesWithoutTime(setup);

      expect({ answered, status, visits: visits.map(({ id, report }) => [id, report?.outcome ?? null]), lastEntry: entries[entries.length - 1] }).toEqual({
        answered: [],
        status: "waiting",
        visits: [["001-write-1", "success"], ["002-review-1", null]],
        lastEntry: { type: "event_received", event: "review.answered", payload: { decision: "rejected" }, answered: [] },
      });
    }, EVENT_REVIEW_COLLECTION);
  }, 10_000);

  it("answers 002-review-1 approved for review.answered with decision approved, and review-loop settles as finished", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startIdleAtReview(setup);

      const { answered } = await session.event({ name: "review.answered", payload: { decision: "approved" } });

      await session.idle();

      const draft = join(setup.workspace, RUN_FOLDER, "visits", "001-write-1", "outputs", "draft.md");
      const eventEntry = timelineEntriesWithoutTime(setup).find(({ type }) => type === "event_received");

      expect({ answered, ending: endOf(session), eventEntry }).toEqual({
        answered: ["002-review-1"],
        ending: {
          status: "settled",
          ending: { outcome: "finished" },
          visits: [
            ["001-write-1", { outcome: "success", produced: { draft } }],
            ["002-review-1", { outcome: "approved" }],
          ],
        },
        eventEntry: { type: "event_received", event: "review.answered", payload: { decision: "approved" }, answered: ["002-review-1"] },
      });
    }, EVENT_REVIEW_COLLECTION);
  }, 10_000);

  it("refuses review.answered sent to review-loop after it settled, and appends nothing to its timeline", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startIdleAtReview(setup);

      await session.event({ name: "review.answered", payload: { decision: "approved" } });

      const entriesBefore = timelineEntriesWithoutTime(setup).length;
      const refusal = await session.event({ name: "review.answered", payload: { decision: "approved" } }).then(
        () => "accepted",
        (error: Error) => error.message,
      );

      expect({ refusal, entriesAdded: timelineEntriesWithoutTime(setup).length - entriesBefore }).toEqual({
        refusal: "the run is settled, and a settled run takes no answers",
        entriesAdded: 0,
      });
    }, EVENT_REVIEW_COLLECTION);
  }, 10_000);
});
