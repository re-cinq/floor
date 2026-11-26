// Run this worker alongside the hello-world pipeline to greet each name it receives, such as "Hello, Ada!".

import { defineStation, type Handle } from "@re-cinq/floor-station";

// { needs } extracts the named inputs from the visit brief; needs.name is the name to greet. https://re-cinq.github.io/floor/sdk/station/#brief
const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

// Start polling for visits assigned to the station named "hello" in the pipeline.
export const station = defineStation("hello", greet);
