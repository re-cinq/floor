// Puts a conversion to a running floor: what a line names first, then the line, since the floor refuses a line naming a station it does not have. Putting the same thing twice changes nothing; a version is its content.
import { asked, reach, serviceToken, type Reachable } from "@re-cinq/floor-client";
import type { Conversion } from "./convert.js";
import type { Named } from "./nodes.js";

export async function putConversion(conversion: Conversion, floorUrl: string, token = process.env.FLOOR_SERVICE_TOKEN): Promise<void> {
  if (!token) throw new Error("putting to a floor needs FLOOR_SERVICE_TOKEN");
  const floor = reach(floorUrl, serviceToken(token));

  await Promise.all(conversion.agentDefinitions.map((definition) => put(floor, "agent-definitions", definition)));
  await Promise.all(conversion.stations.map((station) => put(floor, "stations", station)));
  await put(floor, "assembly-lines", conversion.line);
}

async function put(floor: Reachable, kind: string, named: Named<object>): Promise<void> {
  await asked(floor, { method: "POST", path: `/${kind}`, body: { id: named.id, ...named.body } });
}
