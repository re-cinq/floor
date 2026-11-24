import { useEffect, useState } from "react";
import type { FixtureStore } from "./RunPanel";

/** The need values of a node's station: loaded from the store on mount, never over what the person typed first, and written back on save. */
export function useFixture(store: FixtureStore | undefined) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    void store?.read().then(({ needs }) => setValues((typed) => ({ ...needs, ...typed })), () => undefined);
  }, [store]);

  return {
    values,
    change: (name: string, value: string) => setValues({ ...values, [name]: value }),
    save: () => void store?.write(values).catch(() => undefined),
  };
}
