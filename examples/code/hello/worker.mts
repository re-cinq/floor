import { defineStation, type Handle } from "@re-cinq/floor-station";

const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

export const station = defineStation("hello", greet);
