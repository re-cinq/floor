import { spawn } from "node:child_process";

export interface Opener {
  command: string;
  args: string[];
}

export function openerOf(platform: NodeJS.Platform, url: string): Opener {
  if (platform === "darwin") return { command: "open", args: [url] };
  // cmd reads & as the end of a command, and the url's fragment holds one.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url.replaceAll("&", "^&")] };

  return { command: "xdg-open", args: [url] };
}

/** Failing to open a browser is not an error: the url is printed, and the person can open it. */
export function openBrowser(url: string): void {
  const { command, args } = openerOf(process.platform, url);
  const opener = spawn(command, args, { stdio: "ignore", detached: true });

  opener.on("error", () => undefined);
  opener.unref();
}
