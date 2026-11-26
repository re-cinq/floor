import { defineStation, type Handle } from "@re-cinq/floor-station";

const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

const station = defineStation("hello", greet, { start: false });

await station.once();
