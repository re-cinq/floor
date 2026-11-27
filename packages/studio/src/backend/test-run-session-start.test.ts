import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCAPING_WRITER_COLLECTION } from "./test-run.fixtures.js";
import { endOf, idleOrMessage, LINKS_ITS_DRAFT, LOCKS_ITS_VISIT_FOLDER, refusalOf, RUN_FOLDER, startReviewLoopOnTides, withTestRunSetup, WRITES_DRAFT } from "./test-run-session.fixtures.js";

describe("startTestRun", () => {
  it("fails 001-write-1 with '\"draft\": ../../escape.md leaves the run folder' and settles review-loop as failed when the agent cannot be started", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        const idled = await idleOrMessage(session);

        expect({ idled, ...endOf(session) }).toEqual({
          idled: "idle",
          status: "settled",
          ending: { outcome: "failed", reason: 'AssemblyLine review-loop: node "write" reported "failed"' },
          visits: [["001-write-1", { outcome: "failed", error: '"draft": ../../escape.md leaves the run folder' }]],
        });
      },
      ESCAPING_WRITER_COLLECTION,
    );
  }, 10_000);

  it("fails 001-write-1 and copies nothing when the agent leaves its draft.md as a link", async () => {
    await withTestRunSetup(LINKS_ITS_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await idleOrMessage(session);

      expect({ ...endOf(session), copied: existsSync(join(setup.workspace, RUN_FOLDER, "visits", "001-write-1", "outputs", "draft.md")) }).toEqual({
        status: "settled",
        ending: { outcome: "failed", reason: 'AssemblyLine review-loop: node "write" reported "failed"' },
        visits: [["001-write-1", { outcome: "failed", error: "draft: draft.md is a link, and an output must be a file the agent wrote" }]],
        copied: false,
      });
    });
  }, 10_000);

  it.skipIf(process.getuid?.() === 0)(
    "settles review-loop with outcome error and the EACCES message when the transcript of 001-write-1 cannot be written",
    async () => {
      await withTestRunSetup(LOCKS_ITS_VISIT_FOLDER, async (setup) => {
        const visitFolder = join(setup.workspace, RUN_FOLDER, "visits", "001-write-1");

        try {
          const session = await startReviewLoopOnTides(setup);

          const idled = await idleOrMessage(session);

          expect({ idled, ...endOf(session) }).toMatchObject({
            idled: "idle",
            status: "settled",
            ending: { outcome: "error", reason: expect.stringMatching(/^EACCES: permission denied, open '.*\/visits\/001-write-1\/transcript\.jsonl'$/) },
          });
        } finally {
          chmodSync(visitFolder, 0o755);
        }
      });
    },
    10_000,
  );
});

describe("cancel", () => {
  it("settles review-loop as cancelled at once when cancelled while 002-review-1 waits, and refuses its later answer", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();
      await session.cancel();
      const refused = await refusalOf(session, "002-review-1", { outcome: "approved", produced: {} });
      const { ending } = session.state();

      expect({ ...refused, ending }).toEqual({
        refusal: "the run is settled, and a settled run takes no answers",
        status: "settled",
        visits: [
          ["001-write-1", "success"],
          ["002-review-1", null],
        ],
        ending: { outcome: "cancelled" },
      });
    });
  }, 10_000);

  it("keeps review-loop finished when it is cancelled after 002-review-1 approved", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();
      await session.report("002-review-1", { outcome: "approved", produced: {} });
      await session.cancel();
      const { status, ending } = session.state();

      expect({ status, ending }).toEqual({ status: "settled", ending: { outcome: "finished" } });
    });
  }, 10_000);
});
