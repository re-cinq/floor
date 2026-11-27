import { spawn } from "node:child_process";

export interface Opener {
  command: string;
  args: string[];
}

export function openerOf(platform: NodeJS.Platform, target: string): Opener {
  if (platform === "darwin") return { command: "open", args: [target] };
  // cmd reads & as the end of a command, and the url's fragment holds one.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", target.replaceAll("&", "^&")] };

  return { command: "xdg-open", args: [target] };
}

/** Opens a url in the browser or a path in the file manager. Failing to open is not an error: the url is printed, and the person can open it. */
export function openOnDesktop(target: string): void {
  const { command, args } = openerOf(process.platform, target);
  const opener = spawn(command, args, { stdio: "ignore", detached: true });

  opener.on("error", () => undefined);
  opener.unref();
}
