import { useEffect, useState } from "react";
import type { StudioConnection, TestRunListings } from "@/socket/studio-connection";

/** The test runs of the selected line, read when the line opens and again whenever one of its runs changes. */
export function useTestRuns(connection: StudioConnection | undefined, line: string | undefined): TestRunListings {
  const [listings, setListings] = useState<TestRunListings>([]);

  useEffect(() => {
    let latest = 0;

    const refresh = () => {
      const request = ++latest;
      connection?.listTests().then((all) => request === latest && setListings(all), () => undefined);
    };

    const unfollow = connection?.onTestChanged((frame) => frame.state.lineId === line && refresh());

    refresh();

    return () => {
      latest = -1;
      unfollow?.();
    };
  }, [connection, line]);

  return listings.filter((listing) => listing.line === line);
}
