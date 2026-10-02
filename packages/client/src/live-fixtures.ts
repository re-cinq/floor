import { CLOSE, type SocketFn } from "./live.js";

export interface Opened<Frame> {
  url: string;
  headers: Record<string, string>;
  say(frame: Frame): void;
  shut(code: number, reason?: string): void;
}

export function fakeSockets<Frame>(): { opened: Opened<Frame>[]; socketFn: SocketFn } {
  const opened: Opened<Frame>[] = [];

  const socketFn: SocketFn = (url, init) => {
    const heardFrames: ((frame: string) => void)[] = [];
    const heardCloses: ((closed: { code: number; reason: string }) => void)[] = [];
    const shut = (code: number, reason = ""): void => heardCloses.forEach((heard) => heard({ code, reason }));

    opened.push({ url, headers: init.headers, say: (frame) => heardFrames.forEach((heard) => heard(JSON.stringify(frame))), shut });

    return {
      onFrame: (heard) => heardFrames.push(heard),
      onClosed: (heard) => heardCloses.push(heard),
      close: (code = CLOSE.settled, reason = "") => shut(code, reason),
    };
  };

  return { opened, socketFn };
}

export async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
