import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANNOTATING_REVIEWER_COLLECTION, ESCAPING_REVIEWER_COLLECTION } from "./test-run.fixtures.js";
import { endOf, refusalOf, RUN_FOLDER, startReviewLoopOnTides, withTestRunSetup, WRITES_DRAFT } from "./test-run-session.fixtures.js";

describe("report", () => {
  it("refuses annotated picked from a path that is not on disk and leaves 002-review-1 open with no outputs", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        const absent = join(setup.workspace, "nowhere", "notes.md");
        const answer = { outcome: "approved", produced: {}, files: { annotated: { picked: absent } } };

        expect({
          ...(await refusalOf(session, "002-review-1", answer)),
          outputsFolder: existsSync(join(setup.workspace, RUN_FOLDER, "visits", "002-review-1", "outputs")),
        }).toEqual({
          refusal: `annotated: the picked file ${absent} is not on disk`,
          status: "waiting",
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", null],
          ],
          outputsFolder: false,
        });
      },
      ANNOTATING_REVIEWER_COLLECTION,
    );
  }, 10_000);

  it.each([{ name: "notes" }, { name: "review_feedback" }])(
    "refuses pasted contents for $name, which is not a file output of reviewer, and leaves 002-review-1 open",
    async ({ name }) => {
      await withTestRunSetup(
        WRITES_DRAFT,
        async (setup) => {
          const session = await startReviewLoopOnTides(setup);

          await session.idle();

          const answer = { outcome: "approved", produced: {}, files: { [name]: { pasted: "Looks fine." } } };

          expect(await refusalOf(session, "002-review-1", answer)).toEqual({
            refusal: `${name} is not a file output of station reviewer`,
            status: "waiting",
            visits: [
              ["001-write-1", "success"],
              ["002-review-1", null],
            ],
          });
        },
        ANNOTATING_REVIEWER_COLLECTION,
      );
    },
    10_000,
  );
});

describe("supplied files", () => {
  const TYPOS_NOTE = "Two typos in line 3.\n";

  it.each([
    {
      how: "picked from the workspace",
      supply: (workspace: string) => {
        const original = join(workspace, "notes.md");

        writeFileSync(original, TYPOS_NOTE);

        return { picked: original };
      },
      afterReport: (workspace: string) => writeFileSync(join(workspace, "notes.md"), "changed afterwards\n"),
    },
    {
      how: "pasted",
      supply: () => ({ pasted: TYPOS_NOTE }),
      afterReport: () => undefined,
    },
  ])(
    "writes annotated $how into 002-review-1/outputs/annotated.md and reports that copy",
    async ({ supply, afterReport }) => {
      await withTestRunSetup(
        WRITES_DRAFT,
        async (setup) => {
          const session = await startReviewLoopOnTides(setup);

          await session.idle();
          await session.report("002-review-1", { outcome: "approved", produced: {}, files: { annotated: supply(setup.workspace) } });
          afterReport(setup.workspace);

          const visitsFolder = join(setup.workspace, RUN_FOLDER, "visits");
          const draft = join(visitsFolder, "001-write-1", "outputs", "draft.md");
          const annotated = join(visitsFolder, "002-review-1", "outputs", "annotated.md");

          expect({ ending: endOf(session), annotatedText: readFileSync(annotated, "utf8") }).toEqual({
            ending: {
              status: "settled",
              ending: { outcome: "finished" },
              visits: [
                ["001-write-1", { outcome: "success", produced: { draft } }],
                ["002-review-1", { outcome: "approved", produced: { annotated } }],
              ],
            },
            annotatedText: TYPOS_NOTE,
          });
        },
        ANNOTATING_REVIEWER_COLLECTION,
      );
    },
    10_000,
  );

  it("refuses annotated at ../../escape.md, which leaves 002-review-1's outputs folder, and writes nothing there", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        const answer = { outcome: "approved", produced: {}, files: { annotated: { pasted: TYPOS_NOTE } } };
        const escaped = join(setup.workspace, RUN_FOLDER, "visits", "escape.md");

        expect({ ...(await refusalOf(session, "002-review-1", answer)), escapedWritten: existsSync(escaped) }).toEqual({
          refusal: `"annotated": ../../escape.md leaves the visit's outputs folder`,
          status: "waiting",
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", null],
          ],
          escapedWritten: false,
        });
      },
      ESCAPING_REVIEWER_COLLECTION,
    );
  }, 10_000);
});
