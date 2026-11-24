import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { producesFound } from "./run-produces.js";
import { agentStation } from "./station-fixtures.js";

describe("producesFound", () => {
  const folders: string[] = [];

  afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
  });

  it("returns report found and notes missing for file produces when only out/report.md exists", async () => {
    const folder = await mkdtemp(join(tmpdir(), "run-produces-"));
    folders.push(folder);
    await mkdir(join(folder, "out"));
    await writeFile(join(folder, "out", "report.md"), "# Report");
    const station = {
      ...agentStation,
      produces: [
        { name: "report", kind: "file" as const, path: "out/report.md" },
        { name: "notes", kind: "file" as const, path: "notes.md" },
      ],
    };

    await expect(producesFound({ station, folder })).resolves.toEqual([
      { name: "report", found: true },
      { name: "notes", found: false },
    ]);
  });

  it.each([
    { answer: "The tests add host keys.", found: true },
    { answer: "", found: false },
    { answer: undefined, found: false },
  ])("returns story found $found for a produce from output when the agent's final answer is $answer", async ({ answer, found }) => {
    const station = { ...agentStation, produces: [{ name: "story", kind: "file" as const, from: "output" as const }] };

    await expect(producesFound({ station, folder: tmpdir(), answer })).resolves.toEqual([{ name: "story", found }]);
  });
});

