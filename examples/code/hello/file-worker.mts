import { defineStation, type Handle } from "@re-cinq/floor-station";

const copyNote: Handle = async (_brief, tools) => {
  const note = await tools.read("note");
  await tools.produce("copy", note);

  return { outcome: "success" };
};

export const station = defineStation("copy-note", copyNote);
