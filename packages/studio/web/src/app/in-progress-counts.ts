import type { TestReadResult, TestRunListings } from "@/socket/studio-connection";

export function isInProgress(status: TestReadResult["status"] | undefined): boolean {
  return status === "running" || status === "waiting";
}

export function inProgressCounts(listings: TestRunListings): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const { line } of listings.filter((listing) => isInProgress(listing.status))) {
    counts[line] = (counts[line] ?? 0) + 1;
  }

  return counts;
}
