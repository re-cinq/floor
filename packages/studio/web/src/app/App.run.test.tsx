// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { agentMarkdown, lineYaml, WORKER_COLLECTION } from "../../../src/backend/collection-view.fixtures";
import { closeStudios, openPage, reloadPage } from "./app-page.fixtures";

afterEach(closeStudios);

describe("App run tab", () => {
  it("shows 'Work ENG-1.' as the rendered prompt when ticket ENG-1 and folder /tmp/run-1 are previewed", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Run" });
    const panel = await screen.findByRole("tabpanel", { name: "Run" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "ticket" }), "ENG-1");
    await userEvent.type(within(panel).getByRole("textbox", { name: "Folder" }), "/tmp/run-1");
    await userEvent.click(within(panel).getByRole("button", { name: "Preview" }));

    expect((await within(panel).findByRole("region", { name: "Rendered prompt" })).textContent).toBe("Work ENG-1.");
  });

  it("shows --dangerously-skip-permissions in the command when bypass, as in the pod is chosen for ticket ENG-1", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Run" });
    const panel = await screen.findByRole("tabpanel", { name: "Run" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "ticket" }), "ENG-1");
    await userEvent.type(within(panel).getByRole("textbox", { name: "Folder" }), "/tmp/run-1");
    await userEvent.click(within(within(panel).getByRole("radiogroup", { name: "Permission" })).getByRole("radio", { name: "bypass, as in the pod" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Preview" }));

    expect((await within(panel).findByRole("region", { name: "Command" })).textContent).toContain("--dangerously-skip-permissions");
  });

  it("shows ENG-1 in the ticket box when the page is reloaded after ticket ENG-1 was previewed", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Run" });
    const panel = await screen.findByRole("tabpanel", { name: "Run" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "ticket" }), "ENG-1");
    await userEvent.type(within(panel).getByRole("textbox", { name: "Folder" }), "/tmp/run-1");
    await userEvent.click(within(panel).getByRole("button", { name: "Preview" }));
    await within(panel).findByRole("region", { name: "Rendered prompt" });
    reloadPage();

    const reloaded = await screen.findByRole("tabpanel", { name: "Run" });

    await waitFor(() => expect((within(reloaded).getByRole("textbox", { name: "ticket" }) as HTMLInputElement).value).toBe("ENG-1"));
  });

  it("shows success in the run result when ticket ENG-1 runs a claude that ends with LORE_NODE_RESULT: success", async () => {
    await withEndedRun(async (panel) => {
      expect((await within(panel).findByRole("region", { name: "Run result" })).textContent).toMatch(/success/);
    });
  });

  it("shows success in the run result when the page is reloaded after ticket ENG-1 ended with LORE_NODE_RESULT: success", async () => {
    await withEndedRun(async (panel) => {
      await within(panel).findByRole("region", { name: "Run result" });
      reloadPage();

      const reloaded = await screen.findByRole("tabpanel", { name: "Run" });

      expect((await within(reloaded).findByRole("region", { name: "Run result" })).textContent).toMatch(/success/);
    });
  });

  it("marks the work to done edge as taken when node work ended with LORE_NODE_RESULT: success", async () => {
    await withEndedRun(async (panel) => {
      await within(panel).findByRole("region", { name: "Run result" });

      await waitFor(() => expect(document.querySelector('[data-edge="work|done|success"]')?.getAttribute("data-taken")).toBe("true"));
    });
  });

  it("shows the agent's answer Done. under Answer, without its LORE_NODE_RESULT line, when node work ended", async () => {
    await withEndedRun(async (panel) => {
      expect((await within(panel).findByRole("region", { name: "Answer" })).querySelector("p")?.textContent).toEqual("Done.");
    });
  });

  it("lists node.done.start under Raised next when node work ended with LORE_NODE_RESULT: success", async () => {
    await withEndedRun(async (panel) => {
      expect((await within(panel).findByRole("region", { name: "Raised next" })).textContent).toContain("node.done.start");
    });
  });

  it("shows the refusal \"ticket\" has no value in an alert when run.start is refused for a ticket left empty", async () => {
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Run" });
    const panel = await screen.findByRole("tabpanel", { name: "Run" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "Folder" }), "/tmp/run-1");
    await userEvent.click(within(panel).getByRole("button", { name: "Run" }));

    expect((await within(panel).findByRole("alert")).textContent).toBe('"ticket" has no value');
  });

  it("shows the rendered prompt and no blockers when file need plan (file to copy to plan.md) is typed an existing file's path", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "floor-run-panel-"));
    const planFile = join(scratch, "plan.md");
    const fileNeedLine = lineYaml("flow", "worker").replace("name: ticket\n        kind: value", "name: plan\n        kind: file\n        path: plan.md");

    try {
      writeFileSync(planFile, "Step one.\n");
      mkdirSync(join(scratch, "folder"));
      await openPage([{ path: "flow/assembly-line.yaml", text: fileNeedLine }, { path: "flow/agents/worker.md", text: agentMarkdown("Work.") }], { hash: "&line=flow&node=work&tab=Run" });
      const panel = await screen.findByRole("tabpanel", { name: "Run" });

      await userEvent.type(await within(panel).findByRole("textbox", { name: "plan (file to copy to plan.md)" }), planFile);
      await userEvent.type(within(panel).getByRole("textbox", { name: "Folder" }), join(scratch, "folder"));
      await userEvent.click(within(panel).getByRole("button", { name: "Preview" }));
      await within(panel).findByRole("region", { name: "Rendered prompt" });

      expect(within(panel).queryByRole("list")).toBeNull();
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

async function withEndedRun(body: (panel: HTMLElement) => Promise<void>): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "floor-run-panel-"));
  const bin = join(scratch, "bin");
  const result = JSON.stringify({ type: "result", result: "Done.\nLORE_NODE_RESULT: success" });

  try {
    mkdirSync(bin);
    mkdirSync(join(scratch, "folder"));
    writeFileSync(join(bin, "claude"), `#!/bin/sh\necho '{"type":"system"}'\nprintf '%s\\n' '${result}'\n`, { mode: 0o755 });
    await openPage(WORKER_COLLECTION, { hash: "&line=flow&node=work&tab=Run", runEnv: { PATH: `${bin}:${process.env.PATH}` } });
    const panel = await screen.findByRole("tabpanel", { name: "Run" });

    await userEvent.type(await within(panel).findByRole("textbox", { name: "ticket" }), "ENG-1");
    await userEvent.type(within(panel).getByRole("textbox", { name: "Folder" }), join(scratch, "folder"));
    await userEvent.click(within(panel).getByRole("button", { name: "Run" }));
    await body(panel);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
