// Lays the copies and links of a workspace onto disk, creating parent folders first.
import { copyFile, mkdir, symlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { NeedPlacement, Workspace } from "./workspace.js";

export async function prepareWorkspace({ copies, links }: Pick<Workspace, "copies" | "links">): Promise<void> {
  await Promise.all([
    ...copies.map((copy) => placed(copy, copyFile)),
    ...links.map((link) => placed(link, (from, to) => symlink(from, to, "dir"))),
  ]);
}

async function placed({ from, to }: NeedPlacement, place: (from: string, to: string) => Promise<void>): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await place(from, to);
}
