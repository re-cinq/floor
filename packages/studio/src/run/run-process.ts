// Spawns an agent CLI in a folder, streaming its stdout and stderr line by line, with cancel.
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { createInterface } from "node:readline";

export interface RunProcessRequest {
  command: string[];
  folder: string;
  env?: Record<string, string>;
}

export interface RunLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface RunningProcess {
  done: Promise<{ exitCode: number | null }>;
  cancel(): void;
}

export function runProcess(
  request: RunProcessRequest,
  onLine: (line: RunLine) => void,
): RunningProcess {
  const [program, ...args] = request.command;
  const child = spawn(program, args, {
    cwd: request.folder,
    env: { ...process.env, ...request.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  readLines(child.stdout, "stdout", onLine);
  readLines(child.stderr, "stderr", onLine);
  const done = new Promise<{ exitCode: number | null }>((resolve) => {
    child.on("close", (exitCode) => resolve({ exitCode }));
  });

  const cancel = () => {
    if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
  };

  return { done, cancel };
}

function readLines(
  input: Readable,
  stream: RunLine["stream"],
  onLine: (line: RunLine) => void,
): void {
  createInterface({ input }).on("line", (text) => onLine({ stream, text }));
}
