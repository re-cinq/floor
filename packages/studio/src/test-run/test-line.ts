// An assembly line as a local test run reads it: its body and stations, and the lookup of a node and its station.
import type { LineBody, LineNode, StationBody } from "@re-cinq/floor-contracts";
import { enforce, walkGraphOf, type WalkGraph } from "@re-cinq/floor-assembly-lines";

export interface TestLine {
  id: string;
  body: LineBody;
  stations: ReadonlyMap<string, StationBody>;
}

export interface NodeStation {
  node: LineNode;
  station: StationBody;
}

export function walkGraphOfLine(line: TestLine): WalkGraph {
  const { stations } = line;

  return walkGraphOf(line.id, line.body, (stationRef) => stations.get(stationRef)?.kind);
}

export function nodeAt(line: TestLine, nodeId: string): LineNode {
  const { nodes } = line.body;
  const node = nodes.find((candidate) => candidate.id === nodeId);
  enforce(node, `node ${nodeId} is not in the line`);

  return node;
}

export function stationAt(line: TestLine, nodeId: string): NodeStation {
  const node = nodeAt(line, nodeId);

  return { node, station: stationOfNode(line, node) };
}

export function stationOfNode(line: TestLine, node: LineNode): StationBody {
  const station = stationBodyOf(line, node);
  enforce(station, `node ${node.id} names no station of the line`);

  return station;
}

export function stationBodyOf(line: TestLine, node: LineNode): StationBody | undefined {
  return node.station === undefined ? undefined : line.stations.get(node.station);
}
