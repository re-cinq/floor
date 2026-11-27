// @vitest-environment jsdom
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios, reloadPage } from "./app-page.fixtures";
import { findWaitingReview, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

const configHome = mkdtempSync(join(tmpdir(), "floor-config-home-"));

afterEach(async () => {
  await closeStudios();
  vi.unstubAllEnvs();
});

afterAll(() => rmSync(configHome, { recursive: true, force: true }));

describe("App test locally, start screen opened again", () => {
  it("opens with topic tides and the workspace the line was last started with", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", configHome);

    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      const hash = new URLSearchParams(window.location.hash.slice(1));
      hash.set("test", "new");
      window.location.hash = hash.toString();
      reloadPage();

      const boxes = {
        topic: (await screen.findByRole<HTMLInputElement>("textbox", { name: "topic" })).value,
        workspace: (await screen.findByRole<HTMLInputElement>("textbox", { name: "Workspace folder" })).value,
      };

      expect(boxes).toEqual({ topic: "tides", workspace });
    });
  }, 20_000);
});
