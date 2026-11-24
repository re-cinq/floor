import { describe, expect, it } from "vitest";
import { collectionView } from "./backend/collection-view.js";
import { WORKER_COLLECTION } from "./backend/collection-view.fixtures.js";
import { PROTOCOL_VERSION, REQUEST_TYPES, collectionFrame, requestSchema, serverFrameSchema } from "./protocol.js";

describe("requestSchema", () => {
  it("reads a collection.read request with an id", () => {
    expect(requestSchema.parse({ id: "r1", type: "collection.read" })).toEqual({ id: "r1", type: "collection.read" });
  });

  it("refuses a request with no id", () => {
    expect(requestSchema.safeParse({ type: "collection.read" }).success).toBe(false);
  });

  it("refuses a request type nobody handles", () => {
    expect(requestSchema.safeParse({ id: "r1", type: "run.start" }).success).toBe(false);
  });

  it("refuses a request that carries a field it does not define", () => {
    expect(requestSchema.safeParse({ id: "r1", type: "collection.read", fixture: "x" }).success).toBe(false);
  });

  it("lists every request type there is", () => {
    expect(REQUEST_TYPES).toEqual(["collection.read", "agent.write", "extra.write", "fixture.write", "fixture.read", "run.preview"]);
  });
});

describe("serverFrameSchema", () => {
  it.each([
    { type: "hello", version: PROTOCOL_VERSION },
    { id: "r1", type: "result", result: { lines: [] } },
    { id: "r1", type: "refused", reason: "no" },
    { type: "refused", reason: "not JSON" },
    { type: "collection", collection: { lines: [], agents: [], refused: [], counts: { lines: 0, agents: 0, refused: 0, problems: 0 } } },
  ])("reads the frame $type", (frame) => {
    expect(serverFrameSchema.parse(frame)).toEqual(frame);
  });

  it("refuses a collection push that holds no collection", () => {
    expect(serverFrameSchema.safeParse({ type: "collection", collection: 7 }).success).toBe(false);
  });
});

describe("collectionFrame", () => {
  const withWorkNode = (change: Record<string, unknown>) => {
    const collection = collectionView(WORKER_COLLECTION, []);
    const [flow] = collection.lines;
    const nodes = flow.nodes.map((node) => (node.id === "work" ? { ...node, ...change } : node));

    return { type: "collection", collection: { ...collection, lines: [{ ...flow, nodes }] } };
  };

  it("accepts the worker collection", () => {
    expect(collectionFrame.safeParse(withWorkNode({})).success).toBe(true);
  });

  it.each([
    { field: "agent prompt 5", change: { agent: { name: "worker", file: "agents/worker.md", prompt: 5, settings: {} } } },
    { field: "events undefined", change: { events: undefined } },
    { field: "needs [undefined]", change: { needs: [undefined] } },
    { field: "produces [7]", change: { produces: [7] } },
  ])("refuses a collection whose work node has $field", ({ change }) => {
    expect(collectionFrame.safeParse(withWorkNode(change)).success).toBe(false);
  });
});
