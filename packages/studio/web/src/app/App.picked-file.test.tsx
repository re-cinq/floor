// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REQUIRED_ANNOTATION_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { cellsOf, findWaitingReview, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

async function requestChangesPickingFile(workspace: string, pickedPath: string): Promise<void> {
  await startReviewLoop(workspace);
  await findWaitingReview();

  await userEvent.type(await screen.findByRole("textbox", { name: "review_feedback" }), "Shorter.");
  await userEvent.type(await screen.findByRole("textbox", { name: "annotated (file on disk)" }), pickedPath);
  await userEvent.click(await screen.findByRole("button", { name: "changes_requested" }));
}

describe("App test locally with a picked file", () => {
  it("says 'annotated: the picked file <path> is not on disk' and keeps the visit waiting when annotated is picked from an absent file", async () => {
    await withScratchWorkspace(
      WRITES_DRAFT,
      async (workspace) => {
        const absentPath = join(workspace, "absent.md");
        await requestChangesPickingFile(workspace, absentPath);

        expect({ alert: (await screen.findByRole("alert")).textContent, row: cellsOf(await findWaitingReview()) }).toEqual({
          alert: `annotated: the picked file ${absentPath} is not on disk`,
          row: ["002-review-1", "review", "waiting", "", "not stated", "Open"],
        });
      },
      REQUIRED_ANNOTATION_COLLECTION,
    );
  });

  it("saves 'Marked up on disk.' to visits/002-review-1/outputs/annotated.md when annotated is picked from a file on disk", async () => {
    const pickedFolder = mkdtempSync(join(tmpdir(), "picked-"));

    try {
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          mkdirSync(join(pickedFolder, "notes"));
          const pickedPath = join(pickedFolder, "notes", "annotated.md");
          writeFileSync(pickedPath, "Marked up on disk.");
          await requestChangesPickingFile(workspace, pickedPath);

          const review = cellsOf(await screen.findByRole("row", { name: /002-review-1.*changes_requested/ }));
          const [runFolder] = readdirSync(workspace);
          const savedPath = join(workspace, runFolder, "visits", "002-review-1", "outputs", "annotated.md");
          expect({ review: review.slice(0, 2), annotated: readFileSync(savedPath, "utf8") }).toEqual({
            review: ["002-review-1", "review"],
            annotated: "Marked up on disk.",
          });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    } finally {
      rmSync(pickedFolder, { recursive: true, force: true });
    }
  });
});
