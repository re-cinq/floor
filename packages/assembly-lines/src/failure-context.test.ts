import { describe, expect, it } from "vitest";
import { previousErrorNeed, previousFailuresNeed } from "./failure-context.js";

describe("previousErrorNeed", () => {
  it.each([null, undefined, ""])("gives no previous error when the last failure's error is %j", (lastFailedError) => {
    expect(previousErrorNeed(lastFailedError)).toBeUndefined();
  });

  it.each([
    { length: 2500, kept: 2500, error: "e".repeat(2499) + "!", expected: "e".repeat(2499) + "!" },
    { length: 2501, kept: 2500, error: "e".repeat(2500) + "!", expected: "e".repeat(2500) },
  ])("keeps $kept characters of a $length character error", ({ error, expected }) => {
    expect(previousErrorNeed(error)).toBe(expected);
  });
});

describe("previousFailuresNeed", () => {
  it.each([[[]], [[null, undefined, ""]]])("gives no previous failures when the earlier errors are %j", (earlierErrors) => {
    expect(previousFailuresNeed(earlierErrors)).toBeUndefined();
  });

  it("joins lint failed, tests failed and build failed and drops timed out when two of six earlier errors are empty", () => {
    expect(previousFailuresNeed([null, "lint failed", "", "tests failed", "build failed", "timed out"])).toBe(
      "lint failed\n---\ntests failed\n---\nbuild failed",
    );
  });
});
