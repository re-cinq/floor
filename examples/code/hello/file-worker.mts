// Use this worker when a pipeline passes a file between stations. It copies the
// bytes from the "note" input to the "copy" output so the next station can read them.

import { defineStation, type Handle } from "@re-cinq/floor-station";

const copyNote: Handle = async (_brief, tools) => {
  // "note" is the file input declared by the station. Read its bytes from Floor.
  const note = await tools.read("note");
  // Store those bytes as "copy". The SDK adds the file reference to the visit report.
  await tools.produce("copy", note);

  return { outcome: "success" };
};

export const station = defineStation("copy-note", copyNote);
