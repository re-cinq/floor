import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

export interface OpenedPage {
  dir: string;
  studio: Studio;
}

interface PageOptions {
  dir?: string;
  token?: string;
  hash?: string;
  runEnv?: Record<string, string>;
  openFolder?: (path: string) => void;
  socketOf?: (studio: Studio) => string;
  watchDebounceMs?: number;
}

export async function openPage(files: CollectionFile[], options: PageOptions = {}): Promise<OpenedPage> {
  const dir = options.dir ?? collectionOnDisk(files);
  const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [], runEnv: options.runEnv, openFolder: options.openFolder, watchDebounceMs: options.watchDebounceMs });

  running.push(studio);
  window.location.hash = hashOf(studio, options);
  render(<App />);

  return { dir, studio };
}

function hashOf(studio: Studio, options: PageOptions): string {
  return `#${new URLSearchParams({ socket: options.socketOf?.(studio) ?? studio.url, token: options.token ?? studio.token }).toString()}${options.hash ?? ""}`;
}

export function reloadPage(): void {
  cleanup();
  render(<App />);
}

interface OpenedPromptEditor {
  dir: string;
  panel: HTMLElement;
  editor: HTMLElement;
}

export async function openPromptEditor(): Promise<OpenedPromptEditor> {
  const { dir } = await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Prompt" });
  const panel = await screen.findByRole("tabpanel", { name: "Prompt" });

  await userEvent.click(await within(panel).findByRole("button", { name: "Edit prompt" }));

  return { dir, panel, editor: await within(panel).findByRole("textbox", { name: "Prompt" }) };
}
