import { defineStation, type Handle } from "@re-cinq/floor-station";

// Each visit supplies the name from the pipeline. Floor puts the returned greeting in the run’s bag.
const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

// Start polling for visits assigned to the station named "hello" in the pipeline.
export const station = defineStation("hello", greet);
