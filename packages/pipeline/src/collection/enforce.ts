// A bouncer for a condition: either it holds, or the message is thrown.
export function enforce(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
