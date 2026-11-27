import { describe, expect, it } from "vitest";
import { refusalOf } from "./stand-in-report";

const fields = [
  { name: "review_feedback", required: true },
  { name: "notes", required: false },
];

describe("refusalOf", () => {
  it("names the first empty required field", () => {
    expect(refusalOf(fields, { notes: "fine" })).toBe("review_feedback is required");
  });

  it("returns undefined when every required field is filled", () => {
    expect(refusalOf(fields, { review_feedback: "tighten it" })).toBeUndefined();
  });

  it("returns undefined when there are no fields", () => {
    expect(refusalOf([], {})).toBeUndefined();
  });
});
