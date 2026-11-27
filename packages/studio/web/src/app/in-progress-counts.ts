import type { TestRunListings } from "@/socket/studio-connection";

export function inProgressCounts(listings: TestRunListings): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const { line } of listings.filter((listing) => listing.status !== "settled")) {
    counts[line] = (counts[line] ?? 0) + 1;
  }

  return counts;
}
