// Shared fixtures for the GitHub stations' tests. Excluded from the build: only tests import it.
import { afterAll, beforeAll } from "vitest";
import type { Tools } from "@floor/station";
import { startFakeGitHub, type FakeGitHub } from "./fake-github.js";

export const PULL_REQUEST = "https://github.com/re-cinq/floor/pull/12";

const TOOLS_TIMEOUT_MS = 1000;

export function githubFixture(): FakeGitHub {
  const holder = {} as FakeGitHub;

  beforeAll(async () => {
    Object.assign(holder, await startFakeGitHub("", new Date("2026-01-01T01:00:00Z")));
  });

  afterAll(async () => {
    await holder.close();
  });

  return holder;
}

export function toolsReading(said: string): Tools {
  return { read: () => Promise.resolve(Buffer.from(said)), produce: () => Promise.resolve(), modelCall: () => Promise.resolve(), signal: AbortSignal.timeout(TOOLS_TIMEOUT_MS) };
}
