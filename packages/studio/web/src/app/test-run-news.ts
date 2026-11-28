import type { TestChangedFrame, TestRunListings } from "@/socket/studio-connection";

/** True when the frame names a run the list does not hold, or a status or ending the list shows differently. */
export function bringsNews(listings: TestRunListings, { run, state }: TestChangedFrame): boolean {
  const listed = listings.find((listing) => listing.run === run);

  return !listed || listed.status !== state.status || endsDifferently(listed.ending, state.ending);
}

function endsDifferently(listed: TestRunListings[number]["ending"], reported: TestRunListings[number]["ending"]): boolean {
  return listed?.outcome !== reported?.outcome || listed?.reason !== reported?.reason;
}
