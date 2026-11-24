import { useState } from "react";

/** An on/off state that starts where `initiallyOn` says and flips on each call to its toggle. */
export function useToggle({ initiallyOn }: { initiallyOn?: boolean }) {
  const [isOn, setIsOn] = useState(!!initiallyOn);

  return [isOn, () => setIsOn((on) => !on)] as const;
}
