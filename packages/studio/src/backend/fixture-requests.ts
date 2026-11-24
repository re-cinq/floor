// The requests that save and read the needs a node is tried with. The line and node come only from the collection view, so a path-like name never reaches the disk.
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { Request } from "../protocol.js";
import type { CollectionView } from "../view.js";
import type { Handler } from "./requests.js";

function hasNode({ lines }: CollectionView, lineId: string, nodeId: string): boolean {
  const nodes = lines.find(({ id }) => id === lineId)?.nodes ?? [];

  return nodes.some(({ id }) => id === nodeId);
}

export type FixtureWrite = Extract<Request, { type: "fixture.write" }>;

export const fixtureWrite: Handler<FixtureWrite> = {
  type: "fixture.write",
  handle: async (context, { line, node, needs }) => {
    enforce(hasNode(await context.readCollection(), line, node), `line ${line} has no node ${node}`);
    await context.writeFixture(line, node, needs);

    return { written: `${line}/${node}` };
  },
};

export type FixtureRead = Extract<Request, { type: "fixture.read" }>;

export const fixtureRead: Handler<FixtureRead> = {
  type: "fixture.read",
  handle: async (context, { line, node }) => {
    enforce(hasNode(await context.readCollection(), line, node), `line ${line} has no node ${node}`);

    return { needs: await context.readFixture(line, node) };
  },
};
