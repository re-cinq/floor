import { describe, expect, it } from "vitest";
import { isWatchExpiry } from "./recipe-watch.js";

describe("isWatchExpiry", () => {
  it("returns true for the kube client's 30 second request timeout", () => {
    expect(isWatchExpiry(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(true);
  });

  it("returns false for a refused connection", () => {
    expect(isWatchExpiry(new Error("connect ECONNREFUSED"))).toBe(false);
  });

  it("returns false when the watch ended without an error", () => {
    expect(isWatchExpiry(undefined)).toBe(false);
  });
});
