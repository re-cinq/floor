// Pure: the floor a command talks to, as it was told. `--floor` names it, or FLOOR_API_URL, the name a station's worker already reads, so one environment serves both.
import type { Floor } from "./floor.js";

export function floorGiven(flag: string | undefined, env: Record<string, string | undefined>, usage: string): Floor {
  const url = flag ?? env.FLOOR_API_URL;
  const token = env.FLOOR_SERVICE_TOKEN;

  if (!url || !token) throw new Error(`a floor is named with --floor or FLOOR_API_URL, and reached with FLOOR_SERVICE_TOKEN\n\n${usage}`);

  return { url: url.replace(/\/$/, ""), token };
}
