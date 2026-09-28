// Puts a conversion to a running floor: what a line names first, then the line, since the floor refuses a line naming a station it does not have. Putting the same thing twice changes nothing; a version is its content.
import type { Conversion } from "./convert.js";
import type { Named } from "./nodes.js";

const REQUEST_TIMEOUT_MS = 30_000;

export async function putConversion(conversion: Conversion, floorUrl: string, token = process.env.FLOOR_SERVICE_TOKEN): Promise<void> {
  if (!token) throw new Error("putting to a floor needs FLOOR_SERVICE_TOKEN");
  const floor = { floorUrl, token };

  await Promise.all(conversion.agentDefinitions.map((definition) => put(floor, "agent-definitions", definition)));
  await Promise.all(conversion.stations.map((station) => put(floor, "stations", station)));
  await put(floor, "assembly-lines", conversion.line);
}

async function put(floor: { floorUrl: string; token: string }, kind: string, named: Named<object>): Promise<void> {
  const response = await fetch(`${floor.floorUrl}/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${floor.token}` },
    body: JSON.stringify({ id: named.id, ...named.body }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`the floor refused ${kind} "${named.id}" with ${response.status}: ${await response.text()}`);
}
