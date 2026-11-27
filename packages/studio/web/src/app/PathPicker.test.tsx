// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FolderListing } from "@/socket/studio-connection";
import PathPicker from "./PathPicker";

interface Deferred {
  path: string | undefined;
  resolve: (listing: FolderListing) => void;
}

function controlledList() {
  const calls: Deferred[] = [];
  const list = (path?: string) =>
    new Promise<FolderListing>((resolve) => {
      calls.push({ path, resolve });
    });

  return { calls, list };
}

describe("PathPicker", () => {
  it("shows inside-fast when the slow answer for slow arrives after the answer for fast", async () => {
    const { calls, list } = controlledList();
    render(<PathPicker mode="folder" startDir="/w" list={list} onChoose={() => undefined} onClose={() => undefined} />);
    await act(async () => calls[0]!.resolve({ path: "/w", parent: "/", folders: ["slow", "fast"], files: [] }));
    await userEvent.click(await screen.findByRole("button", { name: "slow" }));
    await userEvent.click(screen.getByRole("button", { name: "fast" }));

    await act(async () => calls[2]!.resolve({ path: "/w/fast", parent: "/w", folders: ["inside-fast"], files: [] }));
    await act(async () => calls[1]!.resolve({ path: "/w/slow", parent: "/w", folders: ["inside-slow"], files: [] }));

    const folders = within(screen.getByRole("region", { name: "Folders" })).getAllByRole("button");
    expect(folders.map((folder) => folder.textContent)).toEqual(["inside-fast"]);
  });
});
