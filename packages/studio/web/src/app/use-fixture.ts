import { useEffect, useState } from "react";
import type { FixtureStore } from "./RunPanel";

/** The need values of a node's station: loaded from the store on mount, never over what the person typed first, and written back on save. */
export function useFixture(store: FixtureStore | undefined) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");

  useEffect(() => {
    void store?.read().then(({ needs }) => setValues((typed) => ({ ...needs, ...typed })), (error: Error) => setFailure(error.message));
  }, [store]);

  return {
    values,
    failure,
    change: (name: string, value: string) => setValues({ ...values, [name]: value }),
    save: () => {
      setFailure("");
      void store?.write(values).catch((error: Error) => setFailure(error.message));
    },
  };
}
