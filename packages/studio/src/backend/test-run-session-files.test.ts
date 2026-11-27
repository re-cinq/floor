import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANNOTATING_REVIEWER_COLLECTION, ESCAPING_REVIEWER_COLLECTION, PATHLESS_ANNOTATING_COLLECTION, REQUIRED_ANNOTATION_COLLECTION } from "./test-run.fixtures.js";
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

  it("refuses annotated picked as the relative path package.json and leaves 002-review-1 open", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const answer = { outcome: "approved", produced: {}, files: { annotated: { picked: "package.json" } } };
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        expect(await refusalOf(session, "002-review-1", answer)).toEqual({
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", null],
          ],
          status: "waiting",
          refusal: 'annotated: the picked file must be an absolute path, and "package.json" is not',
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

  const pickedFromWorkspace = {
    how: "picked from the workspace",
    supply: (workspace: string) => {
      const original = join(workspace, "notes.md");

      writeFileSync(original, TYPOS_NOTE);

      return { picked: original };
    },
    afterReport: (workspace: string) => writeFileSync(join(workspace, "notes.md"), "changed afterwards\n"),
  };
  const pasted = {
    how: "pasted",
    supply: () => ({ pasted: TYPOS_NOTE }),
    afterReport: () => undefined,
  };

  it.each([
    { ...pickedFromWorkspace, files: ANNOTATING_REVIEWER_COLLECTION, outputName: "annotated.md" },
    { ...pasted, files: ANNOTATING_REVIEWER_COLLECTION, outputName: "annotated.md" },
    { ...pickedFromWorkspace, how: "picked from the workspace with no declared path", files: PATHLESS_ANNOTATING_COLLECTION, outputName: "annotated" },
    { ...pasted, how: "pasted with no declared path", files: PATHLESS_ANNOTATING_COLLECTION, outputName: "annotated" },
  ])(
    "writes annotated $how into 002-review-1/outputs/$outputName and reports that copy",
    async ({ supply, afterReport, files, outputName }) => {
      await withTestRunSetup(
        WRITES_DRAFT,
        async (setup) => {
          const session = await startReviewLoopOnTides(setup);

          await session.idle();
          await session.report("002-review-1", { outcome: "approved", produced: {}, files: { annotated: supply(setup.workspace) } });
          afterReport(setup.workspace);

          const visitsFolder = join(setup.workspace, RUN_FOLDER, "visits");
          const draft = join(visitsFolder, "001-write-1", "outputs", "draft.md");
          const annotated = join(visitsFolder, "002-review-1", "outputs", outputName);

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
        files,
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

  it("refuses the answer with the copy's ENOENT and leaves 002-review-1 open when the picked notes.md vanishes before it is copied", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        const notes = join(setup.workspace, "notes.md");

        writeFileSync(notes, TYPOS_NOTE);

        const reporting = session.report("002-review-1", { outcome: "approved", produced: {}, files: { annotated: { picked: notes } } });

        rmSync(notes);

        const refusal = await reporting.then(
          () => "reported",
          (thrown: Error) => thrown.message,
        );
        const { status, visits } = session.state();
        const annotated = join(setup.workspace, RUN_FOLDER, "visits", "002-review-1", "outputs", "annotated.md");

        expect({ refusal, status, visits: visits.map(({ id, report }) => [id, report?.outcome ?? null]), annotatedWritten: existsSync(annotated) }).toMatchObject({
          refusal: expect.stringMatching(/^ENOENT: no such file or directory, copyfile '.*notes\.md'/),
          status: "waiting",
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", null],
          ],
          annotatedWritten: false,
        });
      },
      ANNOTATING_REVIEWER_COLLECTION,
    );
  }, 10_000);

  it("accepts changes_requested with annotated supplied as pasted text, although write requires it, and runs 003-write-2", async () => {
    await withTestRunSetup(
      WRITES_DRAFT,
      async (setup) => {
        const session = await startReviewLoopOnTides(setup);

        await session.idle();

        const answer = { outcome: "changes_requested", produced: { review_feedback: "Shorter." }, files: { annotated: { pasted: TYPOS_NOTE } } };

        expect(await refusalOf(session, "002-review-1", answer)).toEqual({
          refusal: "reported",
          status: "waiting",
          visits: [
            ["001-write-1", "success"],
            ["002-review-1", "changes_requested"],
            ["003-write-2", "success"],
            ["004-review-2", null],
          ],
        });
      },
      REQUIRED_ANNOTATION_COLLECTION,
    );
  }, 10_000);
});
