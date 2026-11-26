// Use this version of the hello worker when a scheduler decides when work runs.
// Each invocation polls once, handles any visits it claims, and exits.

import { defineStation, type Handle } from "@re-cinq/floor-station";

// Each visit supplies the name from the pipeline. Floor puts the returned greeting in the run’s bag.
const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

// Leave polling to the caller so this worker can run as a one-off job.
const station = defineStation("hello", greet, { start: false });

// Process one batch and exit. An empty queue returns immediately.
await station.once();
