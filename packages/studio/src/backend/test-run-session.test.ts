import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startTestRun } from "./test-run-session.js";
import { PINNED_REVIEWER_COLLECTION } from "./test-run.fixtures.js";
import {
  endOf,
  EXITS_WITH_3,
  refusalOf,
  RUN_FOLDER,
  settleReviewLoopApproved,
  STARTED_AT,
  startReviewLoopOnTides,
  withTestRunSetup,
  WRITES_DRAFT,
  WRITES_ITS_PROMPT,
} from "./test-run-session.fixtures.js";

describe("startTestRun", () => {
  it("runs write, saves its draft 'A draft about tides.' and waits at review with that draft, for review-loop with topic tides", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        const runFolder = join(setup.workspace, RUN_FOLDER);
        const draft = join(
          runFolder,
          "visits",
          "001-write-1",
          "outputs",
          "draft.md",
        );

        expect({
          state: session.state(),
          draftText: readFileSync(draft, "utf8"),
        }).toMatchObject({
          state: {
            folder: runFolder,
            lineId: "review-loop",
            status: "waiting",
            visits: [
              {
                id: "001-write-1",
                nodeId: "write",
                iteration: 1,
                station: "draft-writer",
                kind: "agent",
                needs: { topic: "tides" },
                report: { outcome: "success", produced: { draft } },
                costUsd: 0.0421,
              },
              {
                id: "002-review-1",
                nodeId: "review",
                iteration: 1,
                station: "reviewer",
                kind: "stand-in",
                needs: { draft },
                report: null,
              },
            ],
          },
          draftText: "A draft about tides.\n",
        });
      },
    );
  }, 10_000);

  it("refuses review-loop with 'review-loop cannot start: topic is missing' and leaves the workspace empty when nothing is entered", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async ({ context, collectionDir, workspace }) => {
        const refusal = await startTestRun(
          context,
          {
            collectionDir,
            lineId: "review-loop",
            workspace,
            entered: {},
            permission: "acceptEdits",
          },
          () => new Date(STARTED_AT),
        ).then(
          () => "started",
          (thrown: Error) => thrown.message,
        );

        expect({ refusal, workspaceEntries: readdirSync(workspace) }).toEqual({
          refusal: "review-loop cannot start: topic is missing",
          workspaceEntries: [],
        });
      },
    );
  }, 10_000);

  it("refuses review-loop whose node review pins reviewer@abc123 and leaves the workspace empty", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const refusal = await startReviewLoopOnTides(setup).then(
          () => "started",
          (thrown: Error) => thrown.message,
        );

        expect({
          refusal,
          workspaceEntries: readdirSync(setup.workspace),
        }).toEqual({
          refusal:
            "review-loop cannot start: node review pins station reviewer@abc123, and a local test run only has the station its file defines: remove the pin to test it",
          workspaceEntries: [],
        });
      },
      PINNED_REVIEWER_COLLECTION,
    );
  }, 10_000);

  it('settles review-loop as failed with \'AssemblyLine review-loop: node "write" reported "failed"\' when the agent exits with code 3', async () => {
    await withTestRunSetup(EXITS_WITH_3, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();

      expect(endOf(session)).toEqual({
        status: "settled",
        ending: {
          outcome: "failed",
          reason: 'AssemblyLine review-loop: node "write" reported "failed"',
        },
        visits: [
          [
            "001-write-1",
            { outcome: "failed", error: "the agent exited with code 3" },
          ],
        ],
      });
    });
  }, 10_000);
});

describe("report", () => {
  it.each([
    {
      visitId: "009-review-1",
      answer: { outcome: "approved", produced: {} },
      refusal: "the run has no visit 009-review-1",
    },
    {
      visitId: "001-write-1",
      answer: { outcome: "success", produced: {} },
      refusal:
        "visit 001-write-1 was run by an agent, and a person cannot answer for it",
    },
    {
      visitId: "002-review-1",
      answer: { outcome: "rejected", produced: {} },
      refusal:
        "review cannot report rejected: its station reviewer has the outcomes approved, changes_requested",
    },
  ])(
    "refuses $answer.outcome at $visitId with '$refusal' and leaves review-loop waiting",
    async ({ visitId, answer, refusal }) => {
      await withTestRunSetup(WRITES_DRAFT, async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        expect(await refusalOf(session, visitId, answer)).toEqual({
          refusal,
          status: "waiting",
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", null],
          ],
        });
      });
    },
    10_000,
  );

  it("stays idle and waiting at 002-review-1 after outcome rejected is refused", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();
      await refusalOf(session, "002-review-1", {
        outcome: "rejected",
        produced: {},
      });

      const idleAfterRefusal = await session.idle().then(
        () => "idle",
        (thrown: Error) => thrown.message,
      );
      const { status } = session.state();

      expect({ idleAfterRefusal, status }).toEqual({
        idleAfterRefusal: "idle",
        status: "waiting",
      });
    });
  }, 10_000);

  it("settles review-loop as finished with visits 001-write-1 success and 002-review-1 approved when review reports approved", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await settleReviewLoopApproved(setup);

      const draft = join(
        setup.workspace,
        RUN_FOLDER,
        "visits",
        "001-write-1",
        "outputs",
        "draft.md",
      );
      expect(endOf(session)).toEqual({
        status: "settled",
        ending: { outcome: "finished" },
        visits: [
          ["001-write-1", { outcome: "success", produced: { draft } }],
          ["002-review-1", { outcome: "approved" }],
        ],
      });
    });
  }, 10_000);

  it("refuses changes_requested at 002-review-1 with 'visit 002-review-1 has already reported approved' and keeps review-loop settled", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await settleReviewLoopApproved(setup);

      expect(
        await refusalOf(session, "002-review-1", {
          outcome: "changes_requested",
          produced: { review_feedback: "Shorter." },
        }),
      ).toEqual({
        refusal: "visit 002-review-1 has already reported approved",
        status: "settled",
        visits: [
          ["001-write-1", "success"],
          ["002-review-1", "approved"],
        ],
      });
    });
  }, 10_000);

  it("briefs 003-write-2 with the exact reason 'Cut the second paragraph; it repeats the first.' and keeps the first draft beside the revised one when review reports changes_requested", async () => {
    const reason = "Cut the second paragraph; it repeats the first.";

    await withTestRunSetup(WRITES_ITS_PROMPT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();
      await session.report("002-review-1", {
        outcome: "changes_requested",
        produced: { review_feedback: reason },
      });

      const visitsFolder = join(setup.workspace, RUN_FOLDER, "visits");
      const firstDraft = readFileSync(
        join(visitsFolder, "001-write-1", "outputs", "draft.md"),
        "utf8",
      );
      const revisedDraft = readFileSync(
        join(visitsFolder, "003-write-2", "outputs", "draft.md"),
        "utf8",
      );
      const { status, visits } = session.state();

      expect({
        status,
        visits: visits.map(({ id, needs }) => [
          id,
          "feedback" in needs ? needs.feedback : null,
        ]),
        firstDraftHasReason: firstDraft.includes(reason),
        revisedDraftHasReason: revisedDraft.includes(reason),
      }).toEqual({
        status: "waiting",
        visits: [
          ["001-write-1", null],
          ["002-review-1", null],
          ["003-write-2", reason],
          ["004-review-2", null],
        ],
        firstDraftHasReason: false,
        revisedDraftHasReason: true,
      });
    });
  }, 10_000);
});
