import { describe, expect, it } from "vitest";
import { crumbsOf } from "./breadcrumbs";

describe("crumbsOf", () => {
  it("labels the last crumb run-1 when the run folder of run-1 is unknown", () => {
    expect(crumbsOf({ collectionName: "cookbook", line: "review-loop", test: "run-1", runFolderName: undefined })).toEqual([
      { label: "cookbook", selection: {} },
      { label: "review-loop", selection: { line: "review-loop" } },
      { label: "Test locally", selection: { line: "review-loop", test: "new" } },
      { label: "run-1" },
    ]);
  });
});
