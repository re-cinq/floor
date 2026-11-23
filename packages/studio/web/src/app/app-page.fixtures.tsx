import { render, screen, within } from "@testing-library/react";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { WORKER_COLLECTION } from "../../../src/backend/collection-view.fixtures";
import { collectionOnDisk } from "../../../src/backend/studio.fixtures";
import { startStudio, type Studio } from "../../../src/backend/start-studio";
import App from "./App";

export const running: Studio[] = [];

export async function closeStudios(): Promise<void> {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
  window.location.hash = "";
}

interface OpenedPage {
  dir: string;
  studio: Studio;
}

export async function openPage(files: CollectionFile[], options: { token?: string; hash?: string } = {}): Promise<OpenedPage> {
  const dir = collectionOnDisk(files);
  const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

  running.push(studio);
  window.location.hash = `#${new URLSearchParams({ socket: studio.url, token: options.token ?? studio.token }).toString()}${options.hash ?? ""}`;
  render(<App />);

  return { dir, studio };
}

interface OpenedPromptEditor {
  dir: string;
  panel: HTMLElement;
  editor: HTMLElement;
}

export async function openPromptEditor(): Promise<OpenedPromptEditor> {
  const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
  const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

  return { dir, panel, editor: await within(panel).findByRole("textbox", { name: "Prompt" }) };
}
