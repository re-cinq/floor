// Run this worker with the shout pipeline to turn a text input into an uppercase value.
// The pipeline uses the returned outcome to choose its next step and stores the shouted text.

import { defineStation } from "@re-cinq/floor-station";

// brief identifies the visit and carries its inputs; this pipeline supplies needs.text. https://re-cinq.github.io/floor/sdk/station/#brief
defineStation("shout", async (brief) => {
  const text = brief.needs.text;
  if (text === "") throw new Error("nothing to shout");

  console.log(`visit ${brief.visitId}: ${text}`);

  return { outcome: "success", produced: { shouted: text.toUpperCase() } };
});
