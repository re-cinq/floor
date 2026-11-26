import { defineStation } from "@re-cinq/floor-station";

export const station = defineStation("copy-note", async (brief, tools) => {
  const note = await tools.read("note");
  await tools.produce("copy", note);

  return { outcome: "success" };
});
