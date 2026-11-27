// A queue that runs async tasks one at a time, in the order they were handed in.
export function inOrder(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return (task) => {
    const result = tail.then(task);

    tail = result.catch(() => undefined);

    return result;
  };
}
