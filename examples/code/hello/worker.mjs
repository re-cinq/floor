import { defineStation } from "@re-cinq/floor-station";

export const station = defineStation("hello", async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
}));
