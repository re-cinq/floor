// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { REPO_AND_BRIEF_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { openStartScreen } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally start screen", () => {
  it("lists topic as a subject value filled by API in the Bag at start table of review-loop", async () => {
    await openStartScreen();
    const table = await screen.findByRole("table", { name: "Bag at start" });

    const bag = within(table)
      .getAllByRole("row")
      .filter((row) => within(row).queryAllByRole("cell").length > 0)
      .map((row) => {
        const [name, kind, from] = within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent);

        return { name, kind, from };
      });

    expect(bag).toEqual([{ name: "topic subject", kind: "value", from: "by API" }]);
  });

  it("opens Choose a folder for Browse for repo and Choose a file for Browse for brief when the line has a git arg repo and a file arg brief", async () => {
    await openStartScreen(undefined, undefined, REPO_AND_BRIEF_COLLECTION);
    const table = await screen.findByRole("table", { name: "Bag at start" });
    await within(table).findByRole("button", { name: "Browse for repo" });

    const repo = await pickerTitleOpenedBy(within(table).getByRole("button", { name: "Browse for repo" }));
    const brief = await pickerTitleOpenedBy(within(table).getByRole("button", { name: "Browse for brief" }));

    expect({ repo, brief }).toEqual({ repo: "Choose a folder", brief: "Choose a file" });
  });
});

async function pickerTitleOpenedBy(browse: HTMLElement): Promise<string | null> {
  await userEvent.click(browse);
  const dialog = await screen.findByRole("dialog");
  const title = within(dialog).getByRole("heading").textContent;
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  return title;
}
