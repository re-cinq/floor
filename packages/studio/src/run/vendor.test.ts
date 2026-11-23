import { describe, expect, it } from "vitest";
import { type Vendor, vendorOf } from "./vendor.js";

describe("vendorOf", () => {
  it.each<{ model: string; vendor: Vendor }>([
    { model: "claude-sonnet-4-6", vendor: "claude" },
    { model: "gpt-4.1", vendor: "codex" },
    { model: "gemini-1.5-pro", vendor: "gemini" },
    { model: "opencode/openai/gpt-4.1", vendor: "opencode" },
  ])("returns $vendor for $model", ({ model, vendor }) => {
    expect(vendorOf(model)).toEqual(vendor);
  });
});
