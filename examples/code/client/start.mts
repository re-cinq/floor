// Start a Hello World run from a service that already has the line installed.
import { createFloorClient, type FloorAccess } from "@re-cinq/floor-client";

export async function startGreeting(access: FloorAccess, name: string) {
  const client = createFloorClient(access);
  // The "name" input identifies the subject; starting it again can join an open run.
  const { run, joined } = await client.lines.start("hello-world", {
    startItems: { name: { kind: "value", ref: name, by: "client" } },
  });

  return { id: run.id, joined };
}
