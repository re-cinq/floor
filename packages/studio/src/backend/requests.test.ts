import { describe, expect, it } from "vitest";
import { REQUEST_TYPES } from "../protocol.js";
import { HANDLERS, answerFrame } from "./requests.js";
import { IDLE_CONTEXT as CONTEXT, WORKER_VIEW as VIEW } from "./requests.fixtures.js";

describe("HANDLERS", () => {
  it("holds one handler for each request type of the protocol", () => {
    expect(HANDLERS.map(({ type }) => type)).toEqual(REQUEST_TYPES);
  });
});

describe("answerFrame", () => {
  it("answers collection.read with a result frame carrying the request's id and the collection", async () => {
    expect(await answerFrame(JSON.stringify({ id: "r1", type: "collection.read" }), CONTEXT)).toEqual({ id: "r1", type: "result", result: VIEW });
  });

  it("refuses text that is not JSON, with no id", async () => {
    expect(await answerFrame("{not json", CONTEXT)).toEqual({ type: "refused", reason: "the frame is not JSON" });
  });

  it("refuses an unknown request type, naming it, with the id it carried", async () => {
    expect(await answerFrame(JSON.stringify({ id: "r2", type: "run.nope" }), CONTEXT)).toEqual({ id: "r2", type: "refused", reason: 'unknown request type "run.nope"; known: collection.read, agent.write, extra.write, fixture.write, fixture.read, run.preview, run.start, run.cancel, run.read, test.start, test.report, test.cancel, test.read, test.preview, folder.open, folder.list, test.event, test.last' });
  });

  it("refuses a request that fails its schema, with the id it carried and the field named", async () => {
    expect(await answerFrame(JSON.stringify({ id: "r3", type: "collection.read", extra: 1 }), CONTEXT)).toMatchObject({ id: "r3", type: "refused", reason: expect.stringContaining("extra") });
  });

  it("refuses a frame that is no object, with no id", async () => {
    expect(await answerFrame("[1]", CONTEXT)).toMatchObject({ type: "refused", reason: expect.stringContaining("unknown request type") });
  });

  it("refuses a request whose handler fails, with the reason", async () => {
    const failing = { ...CONTEXT, readCollection: async () => Promise.reject(new Error("the folder is gone")) };

    expect(await answerFrame(JSON.stringify({ id: "r4", type: "collection.read" }), failing)).toEqual({ id: "r4", type: "refused", reason: "the folder is gone" });
  });
});
