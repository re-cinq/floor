import { afterEach, describe, expect, it, vi } from "vitest";
import { FloorClient } from "./floor-client.js";

const abortedSignal = AbortSignal.abort();

const fetchThatHonoursItsSignal: typeof fetch = (input, init) =>
  init?.signal?.aborted ? Promise.reject(new Error("timed out")) : new Promise(() => {});

describe("FloorClient timeouts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives up on a floor that does not answer", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abortedSignal);
    const client = new FloorClient({ baseUrl: "http://floor", token: "t", fetchFn: fetchThatHonoursItsSignal });

    await expect(client.claim(["kind:agent"], 1)).rejects.toThrow(new Error("timed out"));
  });
});
