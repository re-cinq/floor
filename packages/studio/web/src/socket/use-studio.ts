import { useEffect, useMemo, useSyncExternalStore } from "react";
import { StudioConnection, type StudioSnapshot } from "./studio-connection";

export interface StudioAddress {
  socket: string;
  token: string;
}

/** The studio's current state, kept in step with the connection; undefined while the page has no address to connect to. */
export function useStudio(address: StudioAddress | undefined): StudioSnapshot | undefined {
  const connection = useMemo(() => (address ? new StudioConnection(address) : undefined), [address?.socket, address?.token]);

  useEffect(() => {
    connection?.start();

    return () => connection?.close();
  }, [connection]);

  return useSyncExternalStore(
    (listener) => connection?.subscribe(listener) ?? (() => undefined),
    () => connection?.snapshot(),
  );
}
