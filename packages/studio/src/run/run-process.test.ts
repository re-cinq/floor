import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProcess } from "./run-process.js";

interface RunLine {
  stream: "stdout" | "stderr";
  text: string;
}

describe("runProcess", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function fakeClaude(script: string): Promise<{ folder: string; bin: string }> {
    const folder = await mkdtemp(join(tmpdir(), "run-process-folder-"));
    const bin = await mkdtemp(join(tmpdir(), "run-process-bin-"));
    tempDirs.push(folder, bin);
    await writeFile(join(bin, "claude"), script);
    await chmod(join(bin, "claude"), 0o755);

    return { folder, bin };
  }

  async function runToEnd(
    folder: string,
    bin: string,
  ): Promise<{ lines: RunLine[]; exitCode: number | null }> {
    const lines: RunLine[] = [];
    const { done } = runProcess(
      { command: ["claude", "--print"], folder, env: { PATH: `${bin}:${process.env.PATH}` } },
      (line) => lines.push(line),
    );
    const { exitCode } = await done;

    return { lines, exitCode };
  }

  it("reports both stdout lines and exit code 0 for a claude on PATH printing two JSON lines", async () => {
    const { folder, bin } = await fakeClaude(
      `#!/bin/sh\necho '{"type":"system"}'\necho '{"type":"result","result":"done"}'\n`,
    );
    const { lines, exitCode } = await runToEnd(folder, bin);

    expect({ lines, exitCode }).toEqual({
      lines: [
        { stream: "stdout", text: '{"type":"system"}' },
        { stream: "stdout", text: '{"type":"result","result":"done"}' },
      ],
      exitCode: 0,
    });
  });

  it("reports exit code null after cancel() stops a claude sleeping 30 seconds after one line", async () => {
    const { folder, bin } = await fakeClaude(`#!/bin/sh\necho '{"type":"system"}'\nsleep 30\n`);
    const lines: RunLine[] = [];

    const running = runProcess(
      { command: ["claude", "--print"], folder, env: { PATH: `${bin}:${process.env.PATH}` } },
      (line) => {
        lines.push(line);
        running.cancel();
      },
    );
    const { exitCode } = await running.done;

    expect({ lines, exitCode }).toEqual({
      lines: [{ stream: "stdout", text: '{"type":"system"}' }],
      exitCode: null,
    });
  }, 5000);

  it("reports stdout and stderr lines tagged by stream and exit code 1 for a claude failing with not logged in", async () => {
    const { folder, bin } = await fakeClaude(
      `#!/bin/sh\necho '{"type":"system"}'\necho 'Error: not logged in' >&2\nexit 1\n`,
    );
    const { lines, exitCode } = await runToEnd(folder, bin);

    const byStream = [...lines].sort((first, second) => first.stream.localeCompare(second.stream));
    expect({ lines: byStream, exitCode }).toEqual({
      lines: [
        { stream: "stderr", text: "Error: not logged in" },
        { stream: "stdout", text: '{"type":"system"}' },
      ],
      exitCode: 1,
    });
  });

  it("does nothing when cancel() is called after a claude printing one line has exited", async () => {
    const { folder, bin } = await fakeClaude(`#!/bin/sh\necho '{"type":"system"}'\n`);
    const running = runProcess(
      { command: ["claude", "--print"], folder, env: { PATH: `${bin}:${process.env.PATH}` } },
      () => {},
    );
    await running.done;

    expect(() => running.cancel()).not.toThrow();
  });

  it(
    "ends with exit code null and 'could not start floor-studio-no-such-agent: spawn floor-studio-no-such-agent ENOENT' when the program is not on PATH",
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "run-process-folder-"));
      tempDirs.push(folder);

      const { done } = runProcess(
        { command: ["floor-studio-no-such-agent"], folder, env: {} },
        () => {},
      );

      expect(await done).toEqual({
        exitCode: null,
        error: "could not start floor-studio-no-such-agent: spawn floor-studio-no-such-agent ENOENT",
      });
    },
    3000,
  );
});
