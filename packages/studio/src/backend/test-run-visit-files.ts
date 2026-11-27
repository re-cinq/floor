// The files of one visit in a local test run's folder: visits/<id>/visit.json, inputs.json, prompt.md and transcript.jsonl.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunLine } from "../run/run-process.js";
import type { VisitRecord } from "../test-run/visit-record.js";

export function visitFolderOf(runFolder: string, visitId: string): string {
  return join(runFolder, "visits", visitId);
}

export function outputsFolderOf(runFolder: string, visitId: string): string {
  return join(visitFolderOf(runFolder, visitId), "outputs");
}

export function writeVisitRecord(runFolder: string, record: VisitRecord): Promise<void> {
  return writeVisitFile(runFolder, record.id, "visit.json", `${JSON.stringify(record, null, 2)}\n`);
}

export function writeVisitInputs(runFolder: string, visitId: string, needs: Readonly<Record<string, string>>): Promise<void> {
  return writeVisitFile(runFolder, visitId, "inputs.json", `${JSON.stringify(needs, null, 2)}\n`);
}

export function writeVisitPrompt(runFolder: string, visitId: string, prompt: string): Promise<void> {
  return writeVisitFile(runFolder, visitId, "prompt.md", prompt);
}

export function writeVisitTranscript(runFolder: string, visitId: string, lines: readonly RunLine[]): Promise<void> {
  return writeVisitFile(runFolder, visitId, "transcript.jsonl", lines.map(({ text }) => `${text}\n`).join(""));
}

async function writeVisitFile(runFolder: string, visitId: string, fileName: string, content: string): Promise<void> {
  const visitFolder = visitFolderOf(runFolder, visitId);

  await mkdir(visitFolder, { recursive: true });
  await writeFile(join(visitFolder, fileName), content);
}
