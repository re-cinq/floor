import { describe, expect, it } from "vitest";
import { isProviderOutOfCredit } from "./provider-credit.js";

function failedWith(error: string | undefined): boolean {
  return isProviderOutOfCredit({ outcome: "failed", error });
}

describe("isProviderOutOfCredit", () => {
  it("returns true for Anthropic's 'Your credit balance is too low to access the Anthropic API'", () => {
    expect(failedWith("Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.")).toBe(true);
  });

  it("returns true for Claude Code's 'Credit balance is too low'", () => {
    expect(failedWith("Credit balance is too low")).toBe(true);
  });

  it("returns true for OpenAI's 'You exceeded your current quota, please check your plan and billing details'", () => {
    expect(failedWith("429 You exceeded your current quota, please check your plan and billing details.")).toBe(true);
  });

  it("returns true for OpenAI's insufficient_quota code", () => {
    expect(failedWith("RateLimitError: code: insufficient_quota")).toBe(true);
  });

  it("returns true for OpenRouter's 'Insufficient credits. Add more using https://openrouter.ai/settings/credits'", () => {
    expect(failedWith("402 Insufficient credits. Add more using https://openrouter.ai/settings/credits")).toBe(true);
  });

  it("returns true for Gemini's 'Your prepayment credits are depleted'", () => {
    expect(failedWith("Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.")).toBe(true);
  });

  it("returns false for 'lint failed'", () => {
    expect(failedWith("lint failed")).toBe(false);
  });

  it("returns false for a rate limit that says nothing of credit", () => {
    expect(failedWith("429 rate limit exceeded, retry after 20s")).toBe(false);
  });

  it("returns false for a report with no error", () => {
    expect(failedWith(undefined)).toBe(false);
  });
});
