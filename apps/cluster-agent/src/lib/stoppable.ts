// The stop switch the claim loop takes as `running` and `sleep`: stopping ends the loop and wakes it from an idle sleep instead of waiting out a delay that outlasts Kubernetes' grace period.

export interface Stoppable {
  running: () => boolean;
  sleep: (delayMs: number) => Promise<void>;
  stop: () => void;
}

export function createStoppable(): Stoppable {
  let isRunning = true;
  const sleepers = new Set<() => void>();

  return {
    running: () => isRunning,
    sleep: (delayMs) =>
      new Promise((resolve) => {
        const wake = (): void => {
          clearTimeout(timer);
          sleepers.delete(wake);
          resolve();
        };

        const timer = setTimeout(wake, delayMs);

        sleepers.add(wake);
      }),
    stop: () => {
      isRunning = false;
      [...sleepers].forEach((wake) => wake());
    },
  };
}
