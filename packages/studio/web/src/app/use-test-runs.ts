import { useEffect, useRef, useState } from "react";
import type { StudioConnection, TestRunListings } from "@/socket/studio-connection";
import { bringsNews } from "./test-run-news";

/** Every test run, read on connect and again whenever a run changes in a way the list does not show yet. */
export function useTestRuns(connection: StudioConnection | undefined): TestRunListings {
  const [listings, setListings] = useState<TestRunListings>([]);
  const shown = useRef(listings);
  shown.current = listings;

  useEffect(() => {
    let latest = 0;

    const refresh = () => {
      const request = ++latest;
      connection?.listTests().then((all) => request === latest && setListings(all), () => undefined);
    };

    const unfollow = connection?.onTestChanged((frame) => bringsNews(shown.current, frame) && refresh());
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
