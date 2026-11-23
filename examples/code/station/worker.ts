import { defineStation } from "@re-cinq/floor-station";

defineStation("shout", async (brief) => {
  const text = brief.needs.text;
  if (text === "") throw new Error("nothing to shout");

  console.log(`visit ${brief.visitId}: ${text}`);

  return { outcome: "success", produced: { shouted: text.toUpperCase() } };
});
