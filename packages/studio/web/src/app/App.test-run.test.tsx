// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVENT_REVIEW_COLLECTION, REQUIRED_ANNOTATION_COLLECTION, REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { closeStudios, openPage } from "./app-page.fixtures";
import { SLEEPS_THEN_WRITES, WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { cellsOf, findWaitingReview, marksOfCard, openedFolders, openStartScreen, startReviewLoop, withScratchFolder, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally", () => {
  it("shows the start screen 'Test review-loop locally' when Test locally is clicked on review-loop", async () => {
    await openPage([...REVIEW_LOOP_COLLECTION], { hash: "&line=review-loop" });

    await userEvent.click(await screen.findByRole("button", { name: "Test locally" }));

    expect(await screen.findByRole("heading", { name: "Test review-loop locally" })).toBeTruthy();
  });

  it("disables Start and says 'topic is missing' on the review-loop start screen when topic is empty", async () => {
    await openStartScreen();

    const missing = await screen.findByText("topic is missing");
    const start = await screen.findByRole("button", { name: "Start" });

    expect({ missing: missing.textContent, startDisabled: (start as HTMLButtonElement).disabled }).toEqual({
      missing: "topic is missing",
      startDisabled: true,
    });
  });

  it("drops 'topic is missing' from the review-loop start screen when tides is typed as topic", async () => {
    await openStartScreen();
    await screen.findByText("topic is missing");

    await userEvent.type(await screen.findByRole("textbox", { name: "topic" }), "tides");

    await waitFor(() => expect(screen.queryByText("topic is missing")).toBeNull());
  });

  it("keeps Start disabled and says 'Choose a workspace folder' on the review-loop start screen when topic is tides and no folder is chosen", async () => {
    await openStartScreen();
    await screen.findByText("topic is missing");

    await userEvent.type(await screen.findByRole("textbox", { name: "topic" }), "tides");
    await waitForElementToBeRemoved(() => screen.queryByText("topic is missing"));

    const start = await screen.findByRole("button", { name: "Start" });
    expect({
      folderPrompt: screen.queryByText("Choose a workspace folder")?.textContent,
      startDisabled: (start as HTMLButtonElement).disabled,
    }).toEqual({ folderPrompt: "Choose a workspace folder", startDisabled: true });
  });

  it("shows 'the workspace folder must be an absolute path, and \"runs\" is not' and stays on the start screen when review-loop is started in folder runs", async () => {
    await openStartScreen();
    await userEvent.type(await screen.findByRole("textbox", { name: "topic" }), "tides");
    await userEvent.type(await screen.findByRole("textbox", { name: "Workspace folder" }), "runs");

    await userEvent.click(await screen.findByRole("button", { name: "Start" }));

    const alert = await screen.findByRole("alert");
    expect({
      alert: alert.textContent,
      heading: Boolean(screen.queryByRole("heading", { name: "Test review-loop locally" })),
    }).toEqual({
      alert: 'the workspace folder must be an absolute path, and "runs" is not',
      heading: true,
    });
  });

  it("opens the run screen 'review-loop test run' with the run id in the address when review-loop is started on tides in an absolute workspace", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);

      const heading = await screen.findByRole("heading", { name: "review-loop test run" });
      expect({
        heading: Boolean(heading),
        test: new URLSearchParams(window.location.hash.slice(1)).get("test"),
      }).toEqual({ heading: true, test: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    });
  });

  it("lists visit 001-write-1 on node write with outcome success and cost $0.0421 when the draft writer succeeds", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);

      const row = await screen.findByRole("row", { name: /001-write-1.*success/ });

      expect(cellsOf(row)).toEqual(expect.arrayContaining(["001-write-1", "write", "success", "$0.0421"]));
    });
  });

  it("shows 001-write-1 took 8.4 s and cost $0.0421 when the draft writer states 8400 ms and $0.0421", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);

      const row = await screen.findByRole("row", { name: /001-write-1.*success/ });

      expect(cellsOf(row)).toEqual(["001-write-1", "write", "success", "8.4 s", "$0.0421", "Open"]);
    });
  });

  it("lists visit 002-review-1 on node review as waiting once the draft writer has succeeded", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);

      const row = await screen.findByRole("row", { name: /002-review-1.*waiting/ });

      expect(cellsOf(row)).toEqual(expect.arrayContaining(["002-review-1", "review", "waiting"]));
    });
  });

  it("shows the cost of the waiting stand-in visit 002-review-1 as 'not stated'", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);

      expect(cellsOf(await findWaitingReview())).toEqual(["002-review-1", "review", "waiting", "", "not stated", "Open"]);
    });
  });

  it("totals review-loop at 8.4 s and $0.0421 while 002-review-1 waits", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      expect(cellsOf(await screen.findByRole("row", { name: /^Total/ }))).toEqual(["Total", "", "", "8.4 s", "$0.0421", ""]);
    });
  });

  it("settles review-loop as finished with 002-review-1 approved when approved is clicked", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await userEvent.click(await screen.findByRole("button", { name: "approved" }));

      expect({
        review: cellsOf(await screen.findByRole("row", { name: /002-review-1.*approved/ })),
        status: (await screen.findByText("finished")).textContent,
      }).toMatchObject({ review: expect.arrayContaining(["002-review-1", "approved"]), status: "finished" });
    });
  });

  it("shows 'visit 002-review-1 has already reported approved' and settles finished when approved is double-clicked", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await userEvent.dblClick(await screen.findByRole("button", { name: "approved" }));

      expect({ alert: (await screen.findByRole("alert")).textContent, status: (await screen.findByText("finished")).textContent }).toEqual({
        alert: "visit 002-review-1 has already reported approved",
        status: "finished",
      });
    });
  });

  it("says 'review_feedback is required' and keeps 002-review-1 waiting when changes_requested is sent with review_feedback empty", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();
      await screen.findByRole("textbox", { name: "review_feedback" });

      await userEvent.click(await screen.findByRole("button", { name: "changes_requested" }));

      expect({ alert: (await screen.findByRole("alert")).textContent, review: cellsOf(await findWaitingReview()) }).toMatchObject({
        alert: "review_feedback is required",
        review: expect.arrayContaining(["002-review-1", "waiting"]),
      });
    });
  });

  it("revises the draft in visit 003-write-2 when changes_requested is sent with review_feedback 'Cut the second paragraph; it repeats the first.'", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await userEvent.type(await screen.findByRole("textbox", { name: "review_feedback" }), "Cut the second paragraph; it repeats the first.");
      await userEvent.click(await screen.findByRole("button", { name: "changes_requested" }));

      expect({
        review: cellsOf(await screen.findByRole("row", { name: /002-review-1.*changes_requested/ })),
        revision: cellsOf(await screen.findByRole("row", { name: /003-write-2.*success/ })),
      }).toMatchObject({
        review: expect.arrayContaining(["002-review-1", "changes_requested"]),
        revision: expect.arrayContaining(["003-write-2", "write", "success"]),
      });
    });
  });

  it("saves annotated pasted as 'Marked up.' to visits/002-review-1/outputs/annotated.md when changes_requested is sent", async () => {
    await withScratchWorkspace(
      WRITES_DRAFT,
      async (workspace) => {
        await startReviewLoop(workspace);
        await findWaitingReview();

        await userEvent.type(await screen.findByRole("textbox", { name: "review_feedback" }), "Shorter.");
        await userEvent.type(await screen.findByRole("textbox", { name: "annotated (paste)" }), "Marked up.");
        await userEvent.click(await screen.findByRole("button", { name: "changes_requested" }));

        const revision = cellsOf(await screen.findByRole("row", { name: /003-write-2/ }))[0];
        const [runFolder] = readdirSync(workspace);
        const annotatedPath = join(workspace, runFolder, "visits", "002-review-1", "outputs", "annotated.md");
        expect({ revision, annotated: readFileSync(annotatedPath, "utf8") }).toEqual({ revision: "003-write-2", annotated: "Marked up." });
      },
      REQUIRED_ANNOTATION_COLLECTION,
    );
  });

  it("opens the run folder <workspace>/review-loop-<UTC time> when Open run folder is clicked", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace, opened) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await userEvent.click(await screen.findByRole("button", { name: "Open run folder" }));

      expect(await openedFolders(opened)).toEqual([
        expect.stringMatching(new RegExp(`^${workspace}/review-loop-\\d{8}-\\d{6}$`)),
      ]);
    });
  });

  it("opens the visit folder <run folder>/visits/001-write-1 when Open visit folder 001-write-1 is clicked", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace, opened) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await userEvent.click(await screen.findByRole("button", { name: "Open visit folder 001-write-1" }));

      expect(await openedFolders(opened)).toEqual([
        expect.stringMatching(new RegExp(`^${workspace}/review-loop-\\d{8}-\\d{6}/visits/001-write-1$`)),
      ]);
    });
  });

  it("shows 001-write-1 as running while its agent runs", async () => {
    await withScratchWorkspace(SLEEPS_THEN_WRITES, async (workspace) => {
      await startReviewLoop(workspace);
      const row = await screen.findByRole("row", { name: /001-write-1.*running/ });
      const cells = cellsOf(row);
      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(cells).toEqual(["001-write-1", "write", "running", "", "not stated", "Open"]);
    });
  }, 10_000);

  it("says 'there is no test run nope' and offers no Cancel or Open run folder when the address names run nope", async () => {
    await openPage([...REVIEW_LOOP_COLLECTION], { hash: "&line=review-loop&test=nope", openFolder: () => undefined });

    expect({
      alert: (await screen.findByRole("alert")).textContent,
      cancel: screen.queryByRole("button", { name: "Cancel" }),
      openRun: screen.queryByRole("button", { name: "Open run folder" }),
    }).toEqual({ alert: "there is no test run nope", cancel: null, openRun: null });
  });

  it("settles review-loop as cancelled with 001-write-1 failed when Cancel is clicked while write runs", async () => {
    await withScratchWorkspace(SLEEPS_THEN_WRITES, async (workspace) => {
      await startReviewLoop(workspace);
      await screen.findByRole("row", { name: /001-write-1.*running/ });

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect({
        status: (await screen.findByText("cancelled")).textContent,
        write: cellsOf(await screen.findByRole("row", { name: /001-write-1.*failed/ })),
      }).toMatchObject({ status: "cancelled", write: expect.arrayContaining(["001-write-1", "failed"]) });
    });
  }, 10_000);

  it("puts <scratch>/runs in the Workspace folder box when runs is picked from the listing of <scratch>, which holds alpha and runs", async () => {
    await withScratchFolder(async (scratch) => {
      mkdirSync(join(scratch, "alpha"));
      mkdirSync(join(scratch, "runs"));
      await openStartScreen();
      const box = await screen.findByRole("textbox", { name: "Workspace folder" });
      await userEvent.type(box, scratch);

      await userEvent.click(await screen.findByRole("button", { name: "Browse" }));
      const listing = await screen.findByRole("region", { name: "Folders" });
      const folders = (await within(listing).findAllByRole("button")).map((button) => button.textContent);
      await userEvent.click(within(listing).getByRole("button", { name: "runs" }));
      await userEvent.click(await screen.findByRole("button", { name: "Use this folder" }));

      expect({ folders, chosen: (box as HTMLInputElement).value }).toEqual({ folders: ["alpha", "runs"], chosen: join(scratch, "runs") });
    });
  });

  it("lists <scratch> again and puts it in the Workspace folder box when Up is clicked from <scratch>/runs", async () => {
    await withScratchFolder(async (scratch) => {
      mkdirSync(join(scratch, "alpha"));
      mkdirSync(join(scratch, "runs"));
      await openStartScreen();
      const box = await screen.findByRole("textbox", { name: "Workspace folder" });
      await userEvent.type(box, join(scratch, "runs"));
      await userEvent.click(await screen.findByRole("button", { name: "Browse" }));

      await userEvent.click(await screen.findByRole("button", { name: "Up" }));
      const listing = await screen.findByRole("region", { name: "Folders" });
      await within(listing).findByRole("button", { name: "alpha" });
      const folders = within(listing).getAllByRole("button").map((button) => button.textContent);
      await userEvent.click(await screen.findByRole("button", { name: "Use this folder" }));

      expect({ folders, chosen: (box as HTMLInputElement).value }).toEqual({ folders: ["alpha", "runs"], chosen: scratch });
    });
  });

  it("says '<scratch>/notes.txt is not a folder on disk' and offers no Use this folder when Browse lists a file", async () => {
    await withScratchFolder(async (scratch) => {
      const notes = join(scratch, "notes.txt");
      writeFileSync(notes, "remember");
      await openStartScreen();
      await userEvent.type(await screen.findByRole("textbox", { name: "Workspace folder" }), notes);

      await userEvent.click(await screen.findByRole("button", { name: "Browse" }));

      expect({
        alert: (await screen.findByRole("alert")).textContent,
        use: screen.queryByRole("button", { name: "Use this folder" }),
      }).toEqual({ alert: `${notes} is not a folder on disk`, use: null });
    });
  });

  it("draws write as visited with success and review as waiting on the run screen's graph while 002-review-1 waits", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await waitFor(() =>
        expect({ write: marksOfCard("write"), review: marksOfCard("review").waiting, done: marksOfCard("done").visited }).toEqual({
          write: { visited: null, outcome: "success", waiting: null },
          review: "true",
          done: "false",
        }),
      );
    });
  });

  it("settles review-loop as finished with 002-review-1 approved when Send review.answered is clicked", async () => {
    await withScratchWorkspace(
      WRITES_DRAFT,
      async (workspace) => {
        await startReviewLoop(workspace);
        await findWaitingReview();

        await userEvent.click(await screen.findByRole("button", { name: "Send review.answered" }));

        expect({
          review: cellsOf(await screen.findByRole("row", { name: /002-review-1.*approved/ })),
          status: (await screen.findByText("finished")).textContent,
        }).toMatchObject({ review: expect.arrayContaining(["002-review-1", "approved"]), status: "finished" });
      },
      EVENT_REVIEW_COLLECTION,
    );
  });
});
