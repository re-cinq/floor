// A request the store understood and will never accept: retrying it cannot help, which is what separates it from a database error.
export class Refusal extends Error {}

export function enforce(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Refusal(message);
}
