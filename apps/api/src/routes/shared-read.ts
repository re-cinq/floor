// A scrape that arrives while one is still being answered waits for that answer instead of asking the database again: Prometheus scrapes on a timer, and a slow answer must not stack a second set of queries behind it.

export function sharedRead<Value>(read: () => Promise<Value>): () => Promise<Value> {
  let running: Promise<Value> | null = null;

  return () => {
    running ??= read().finally(() => {
      running = null;
    });

    return running;
  };
}
