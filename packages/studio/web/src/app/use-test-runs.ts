import { useEffect, useState } from "react";
import type { StudioConnection, TestRunListings } from "@/socket/studio-connection";

/** Every test run, read on connect and again whenever any run changes. */
export function useTestRuns(connection: StudioConnection | undefined): TestRunListings {
  const [listings, setListings] = useState<TestRunListings>([]);

  useEffect(() => {
    let latest = 0;

    const refresh = () => {
      const request = ++latest;
      connection?.listTests().then((all) => request === latest && setListings(all), () => undefined);
    };

    const unfollow = connection?.onTestChanged(refresh);
    const unwatch = connection?.onOpened(refresh);

    refresh();

    return () => {
      latest = -1;
      unfollow?.();
      unwatch?.();
    };
  }, [connection]);

  return listings;
}
