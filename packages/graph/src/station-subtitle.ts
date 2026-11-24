// What a card says under its title: the kind, then how often the run came and whether a visit is still open.
import type { StationVisits } from "./metro/station-visits";

export function subtitleOf(kind: string, status?: StationVisits): string {
  const visitCount =
    status && status.count > 1 ? ` · ${status.count} visits` : "";
  const openMark = status?.open ? " · open" : "";

  return `${kind}${visitCount}${openMark}`;
}
