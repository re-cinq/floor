// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REQUIRED_ANNOTATION_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { cellsOf, findWaitingReview, startReviewLoop, withScratchFolder, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);
afterEach(() => vi.unstubAllEnvs());

async function openChooseAFile(workspace: string): Promise<HTMLElement> {
  await reachWaitingReview(workspace);
  await userEvent.click(await screen.findByRole("button", { name: "Browse for annotated" }));

  return screen.findByRole("dialog", { name: "Choose a file" });
}

function listedFiles(dialog: HTMLElement): (string | null)[] {
  return within(within(dialog).getByRole("region", { name: "Files" })).queryAllByRole("button").map((button) => button.textContent);
}

async function reachWaitingReview(workspace: string): Promise<void> {
  await startReviewLoop(workspace);
  await findWaitingReview();
}

async function requestChangesPickingFile(workspace: string, pickedPath: string, pastedText = ""): Promise<void> {
  await reachWaitingReview(workspace);

  await userEvent.type(await screen.findByRole("textbox", { name: "review_feedback" }), "Shorter.");
  if (pastedText) await userEvent.type(await screen.findByRole("textbox", { name: "annotated (paste)" }), pastedText);
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

  it("says 'annotated: paste its contents or give a file on disk, not both' and writes no outputs when annotated is pasted and picked", async () => {
    const pickedFolder = mkdtempSync(join(tmpdir(), "picked-"));

    try {
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          const pickedPath = join(pickedFolder, "annotated.md");
          writeFileSync(pickedPath, "Marked up on disk.");
          await requestChangesPickingFile(workspace, pickedPath, "Marked up.");

          const alert = (await screen.findByRole("alert")).textContent;
          const row = cellsOf(await findWaitingReview());
          const [runFolder] = readdirSync(workspace);
          expect({ alert, row, outputs: existsSync(join(workspace, runFolder, "visits", "002-review-1", "outputs")) }).toEqual({
            alert: "annotated: paste its contents or give a file on disk, not both",
            row: ["002-review-1", "review", "waiting", "", "not stated", "Open"],
            outputs: false,
          });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    } finally {
      rmSync(pickedFolder, { recursive: true, force: true });
    }
  });

  it("puts <home>/notes.md in the annotated (file on disk) box when notes.md is picked in the Choose a file dialog and the box was empty", async () => {
    await withScratchFolder(async (home) => {
      writeFileSync(join(home, "notes.md"), "Marked up on disk.");
      vi.stubEnv("HOME", home);
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          const dialog = await openChooseAFile(workspace);
          const box = (await screen.findByRole("textbox", { name: "annotated (file on disk)" })) as HTMLInputElement;
          await userEvent.click(await within(dialog).findByRole("button", { name: "notes.md" }));
          await userEvent.click(within(dialog).getByRole("button", { name: "Use this file" }));

          expect({ dialog: screen.queryByRole("dialog"), chosen: box.value }).toEqual({ dialog: null, chosen: join(home, "notes.md") });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    });
  });

  it("lists only notes.md under Show files '*.md' and both files after All files when annotated declares annotated.md", async () => {
    await withScratchFolder(async (home) => {
      writeFileSync(join(home, "notes.md"), "Marked up on disk.");
      writeFileSync(join(home, "photo.png"), "pixels");
      vi.stubEnv("HOME", home);
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          const dialog = await openChooseAFile(workspace);
          await within(dialog).findByRole("button", { name: "notes.md" });
          const masked = listedFiles(dialog);
          const showFiles = within(dialog).getByRole("combobox", { name: "Show files" });
          const shown = within(showFiles).getByRole("option", { selected: true }).textContent;

          await userEvent.selectOptions(showFiles, "All files");

          expect({ masked, shown, all: listedFiles(dialog) }).toEqual({ masked: ["notes.md"], shown: "*.md", all: ["notes.md", "photo.png"] });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    });
  });

  it("offers no Use this file when photo.png was picked under All files and Show files returns to '*.md'", async () => {
    await withScratchFolder(async (home) => {
      writeFileSync(join(home, "notes.md"), "Marked up on disk.");
      writeFileSync(join(home, "photo.png"), "pixels");
      vi.stubEnv("HOME", home);
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          const dialog = await openChooseAFile(workspace);
          const showFiles = within(dialog).getByRole("combobox", { name: "Show files" });
          await userEvent.selectOptions(showFiles, "All files");
          await userEvent.click(await within(dialog).findByRole("button", { name: "photo.png" }));
          await userEvent.selectOptions(showFiles, "*.md");

          expect({ useThisFile: within(dialog).queryByRole("button", { name: "Use this file" }) }).toEqual({ useThisFile: null });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    });
  });

  it.each(["outline.md", "notes.md"])("offers no Use this file when notes.md was picked in home and the drafts subfolder holding %s is opened", async (draftsFile) => {
    await withScratchFolder(async (home) => {
      writeFileSync(join(home, "notes.md"), "Marked up on disk.");
      mkdirSync(join(home, "drafts"));
      writeFileSync(join(home, "drafts", draftsFile), "Draft.");
      vi.stubEnv("HOME", home);
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace) => {
          const dialog = await openChooseAFile(workspace);
          await userEvent.click(await within(dialog).findByRole("button", { name: "notes.md" }));
          await userEvent.click(within(dialog).getByRole("button", { name: "drafts" }));
          await within(dialog).findByDisplayValue(`${join(home, "drafts")}/`);

          expect({ useThisFile: within(dialog).queryByRole("button", { name: "Use this file" }) }).toEqual({ useThisFile: null });
        },
        REQUIRED_ANNOTATION_COLLECTION,
      );
    });
  });
});
