// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closeStudios } from "./app-page.fixtures";
import { openStartScreen, withScratchFolder } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally Choose a folder dialog", () => {
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

  it("says '<scratch>/notes.txt is not a folder on disk' and the Choose a folder dialog offers no Use this folder when Browse lists a file", async () => {
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

  it.each([
    { kind: "relative", pathIn: () => "relative/folder", reason: () => 'the folder to list must be an absolute path, and "relative/folder" is not' },
    { kind: "missing absolute", pathIn: (scratch: string) => join(scratch, "absent"), reason: (scratch: string) => `${join(scratch, "absent")} is not a folder on disk` },
  ])("shows the backend's reason and the Choose a folder dialog offers no Use this folder when Browse lists the $kind path", async ({ pathIn, reason }) => {
    await withScratchFolder(async (scratch) => {
      await openStartScreen();
      await userEvent.type(await screen.findByRole("textbox", { name: "Workspace folder" }), pathIn(scratch));

      await userEvent.click(await screen.findByRole("button", { name: "Browse" }));

      expect({
        alert: (await screen.findByRole("alert")).textContent,
        use: screen.queryByRole("button", { name: "Use this folder" }),
      }).toEqual({ alert: reason(scratch), use: null });
    });
  });

  it("closes the Choose a folder dialog and keeps <scratch> in the Workspace folder box when Cancel is clicked after Browse listed its alpha subfolder", async () => {
    await withScratchFolder(async (scratch) => {
      mkdirSync(join(scratch, "alpha"));
      await openStartScreen();
      const box = (await screen.findByRole("textbox", { name: "Workspace folder" })) as HTMLInputElement;
      await userEvent.type(box, scratch);
      await userEvent.click(await screen.findByRole("button", { name: "Browse" }));
      const dialog = await screen.findByRole("dialog", { name: "Choose a folder" });
      await within(dialog).findByRole("button", { name: "alpha" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect({ dialog: screen.queryByRole("dialog"), workspace: box.value }).toEqual({ dialog: null, workspace: scratch });
    });
  });

  it("puts / in the Workspace folder box when Browse is clicked with the box empty and the listing is used", async () => {
    await openStartScreen();

    await userEvent.click(await screen.findByRole("button", { name: "Browse" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this folder" }));

    expect(((await screen.findByRole("textbox", { name: "Workspace folder" })) as HTMLInputElement).value).toBe("/");
  });
});
