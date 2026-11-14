import { describe, expect, it } from "vitest";
import { sharedRead } from "./shared-read.js";

function gatedRead() {
  const calls: Array<(value: number) => void> = [];
  const read = () => new Promise<number>((resolve) => calls.push(resolve));

  return { read, calls };
}

describe("sharedRead", () => {
  it("asks once for two scrapes that arrive while the first read is running, and answers both with 7", async () => {
    const { read, calls } = gatedRead();
    const shared = sharedRead(read);

    const first = shared();
    const second = shared();
    calls[0]!(7);

    expect({ answers: await Promise.all([first, second]), reads: calls.length }).toEqual({ answers: [7, 7], reads: 1 });
  });

  it("asks again for a scrape that arrives after the first read finished", async () => {
    const { read, calls } = gatedRead();
    const shared = sharedRead(read);

    const first = shared();
    calls[0]!(1);
    await first;
    const second = shared();
    calls[1]!(2);

    expect({ answer: await second, reads: calls.length }).toEqual({ answer: 2, reads: 2 });
  });

  it("asks again after a read that failed", async () => {
    let reads = 0;
    const shared = sharedRead(async () => {
      reads += 1;
      if (reads === 1) throw new Error("timeout");

      return 3;
    });

    const failed = await shared().catch((error: Error) => error.message);

    expect({ failed, answer: await shared(), reads }).toEqual({ failed: "timeout", answer: 3, reads: 2 });
  });
});
