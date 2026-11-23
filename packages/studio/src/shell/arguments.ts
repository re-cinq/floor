import { parseArgs } from "node:util";

const MAX_PORT = 65535;
const OPTIONS = { port: { type: "string" }, "host-key": { type: "string", multiple: true }, "no-open": { type: "boolean" }, help: { type: "boolean" } } as const;

export interface RunArguments {
  kind: "run";
  dir: string;
  /** The backend's socket port; 0 picks a free one. */
  port: number;
  hostKeys: string[];
  open: boolean;
}

export type StudioArguments = RunArguments | { kind: "help" } | { kind: "bad"; reason: string };

export function parseStudioArguments(argv: string[]): StudioArguments {
  try {
    return interpreted(parsed(argv));
  } catch (cause) {
    return { kind: "bad", reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

function parsed(argv: string[]) {
  return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
}

function interpreted(parsedOptions: ReturnType<typeof parsed>): StudioArguments {
  const { values, positionals } = parsedOptions;

  if (values.help) return { kind: "help" };
  if (positionals.length > 1) return { kind: "bad", reason: `one directory at most: got ${positionals.join(", ")}` };
  const port = Number(values.port ?? 0);

  if (!isPort(port)) return { kind: "bad", reason: `--port needs a whole number from 0 to ${MAX_PORT}` };

  return runOf(parsedOptions, port);
}

function runOf({ values, positionals }: ReturnType<typeof parsed>, port: number): RunArguments {
  return { kind: "run", dir: positionals[0] ?? ".", port, hostKeys: values["host-key"] ?? [], open: !values["no-open"] };
}

function isPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= MAX_PORT;
}
