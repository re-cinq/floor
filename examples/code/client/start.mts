// Start a Hello World run from a service that already has the line installed.
import { createFloorClient, type FloorAccess } from "@re-cinq/floor-client";

export async function startGreeting(
  // access supplies the Floor URL and the service token used for requests. https://re-cinq.github.io/floor/sdk/client/#flooraccess
  access: FloorAccess,
  // name is the input value for the hello-world line and identifies the run’s subject. https://re-cinq.github.io/floor/specs/run-semantics/#11-the-subject
  name: string,
) {
  const client = createFloorClient(access);
  // The "name" input identifies the subject; starting it again can join an open run.
  const { run, joined } = await client.lines.start("hello-world", {
    startItems: { name: { kind: "value", ref: name, by: "client" } },
  });

  return { id: run.id, joined };
}
