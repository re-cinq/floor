import { describe, expect, it } from "vitest";
import { type Vendor, vendorOf } from "./vendor.js";

describe("vendorOf", () => {
  it.each<{ model: string; vendor: Vendor }>([
    { model: "claude-sonnet-4-6", vendor: "claude" },
    { model: "gpt-4.1", vendor: "codex" },
    { model: "o3-mini", vendor: "codex" },
    { model: "openai/codex-mini", vendor: "codex" },
    { model: "gemini-1.5-pro", vendor: "gemini" },
    { model: "opencode/openai/gpt-4.1", vendor: "opencode" },
    { model: "exec", vendor: "exec" },
    { model: "executive-model", vendor: "claude" },
    { model: "GEMINI-1.5-PRO", vendor: "gemini" },
    { model: "EXEC", vendor: "exec" },
    { model: "", vendor: "claude" },
    { model: "something-weird", vendor: "claude" },
    { model: "gpt-5-codex", vendor: "codex" },
    { model: "o1-preview", vendor: "codex" },
    { model: "o4-mini", vendor: "codex" },
    { model: "opencode", vendor: "opencode" },
  ])("returns $vendor for $model", ({ model, vendor }) => {
    expect(vendorOf(model)).toEqual(vendor);
  });
});
