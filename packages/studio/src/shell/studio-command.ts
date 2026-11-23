// The `floor-studio` command without the process around it: arguments in, an exit code or a running studio out.
import { resolve } from "node:path";
import { startStudio } from "../backend/start-studio.js";
import { parseStudioArguments, type RunArguments } from "./arguments.js";
import { openBrowser } from "./open-browser.js";
import { pageUrl } from "./page-url.js";
import { startPageServer } from "./static-files.js";

export const USAGE = `floor-studio [dir] [--port <n>] [--host-key <name>]... [--no-open]

  dir               the collection: one folder a line, with its assembly-line.yaml and agents/. Default: the current directory
  --port <n>        the port of the backend's socket on 127.0.0.1. Default: a free one
  --host-key <name> a frontmatter key the host owns, accepted in an agent file; as often as needed
  --no-open         print the url and do not open a browser
  --help            this text`;

export interface Shell {
  out(line: string): void;
  err(line: string): void;
  /** The folder the built page is in. */
  pageDir: string;
}

export interface RunningStudio {
  pageUrl: string;
  close(): Promise<void>;
}

export type Outcome = { exitCode: number } | { running: RunningStudio };

const FAILED = 1;
const WRONG_CALL = 2;

export async function studioCommand(argv: string[], shell: Shell): Promise<Outcome> {
  const given = parseStudioArguments(argv);

  if (given.kind === "help") return printed(shell, USAGE, 0);
  if (given.kind === "bad") return refused(shell, WRONG_CALL, `floor-studio: ${given.reason}`, USAGE);

  return started(given, shell).catch((cause: Error) => refused(shell, FAILED, `floor-studio: ${cause.message}`));
}

function printed(shell: Shell, text: string, exitCode: number): Outcome {
  shell.out(text);

  return { exitCode };
}

function refused(shell: Shell, exitCode: number, ...lines: string[]): Outcome {
  lines.forEach((line) => shell.err(line));

  return { exitCode };
}

async function started(given: RunArguments, shell: Shell): Promise<Outcome> {
  const page = await startPageServer(shell.pageDir);
  // Only the page's own origin may use the socket, whether the browser shows it as 127.0.0.1 or localhost.
  const studio = await startStudio({ dir: resolve(given.dir), port: given.port, hostKeys: given.hostKeys, origins: [page.origin, page.origin.replace("127.0.0.1", "localhost")] }).catch(async (cause: Error) => {
    await page.close();
    throw cause;
  });
  const url = pageUrl({ origin: page.origin, socket: studio.url, token: studio.token });

  shell.out(`floor-studio: ${url}`);
  if (given.open) openBrowser(url);

  return { running: { pageUrl: url, close: async () => void (await Promise.all([studio.close(), page.close()])) } };
}
