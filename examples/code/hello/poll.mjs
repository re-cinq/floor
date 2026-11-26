import { defineStation } from "@re-cinq/floor-station";

const station = defineStation("hello", async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
}), { start: false });

await station.once();
