import { describe, expect, it } from "vitest";
import { pricedBy } from "./pricing.js";

const PRO = { inputPerMillion: 2, outputPerMillion: 12 };
const FLASH = { inputPerMillion: 0.5, outputPerMillion: 3 };
const GEMINI = { model: "gemini-3.1-pro-preview", prices: { "gemini-3.1-pro-preview": PRO, "gemini-3-flash-preview": FLASH } };
const COUNTED = { input_tokens: 1_000_000, cache_read_input_tokens: 0, output_tokens: 100_000 };

describe("pricedBy", () => {
  it("believes an agent that says what it cost, whatever prices are stated", () => {
    expect(pricedBy(GEMINI, { costUsd: 0.42, usage: COUNTED })).toEqual({ costUsd: 0.42 });
  });

  it("prices a million tokens read at $2 and a hundred thousand written at $12 a million as $3.20", () => {
    expect(pricedBy(GEMINI, { usage: COUNTED })).toEqual({ costUsd: 3.2 });
  });

  it("prices each model at its own rate: the one the agent was given, and the one it called on the side", () => {
    const models = { "gemini-3.1-pro-preview": COUNTED, "gemini-3-flash-preview": { input_tokens: 200_000, output_tokens: 10_000 } };

    expect(pricedBy(GEMINI, { usage: COUNTED, models })).toEqual({ costUsd: 3.33 });
  });

  it("prices what was read from the cache as any other reading, with no cache price stated", () => {
    expect(pricedBy(GEMINI, { usage: { input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0 } })).toEqual({ costUsd: 2 });
  });

  it("prices what was read from the cache at the cache's price, where one is stated", () => {
    const cheaper = { model: "gemini-3.1-pro-preview", prices: { "gemini-3.1-pro-preview": { ...PRO, cacheReadPerMillion: 0.2 } } };

    expect(pricedBy(cheaper, { usage: { input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0 } })).toEqual({ costUsd: 0.2 });
  });

  it("names the model it could not price, and leaves its part out of the cost", () => {
    const models = { "gemini-3.1-pro-preview": COUNTED, "gemini-9-ultra": { input_tokens: 5, output_tokens: 5 } };

    expect(pricedBy(GEMINI, { models })).toEqual({ costUsd: 3.2, unpriced: ["gemini-9-ultra"] });
  });

  it("gives no cost, and names the model, for a definition that states no prices", () => {
    expect(pricedBy({ model: "gemini-3.1-pro-preview" }, { usage: COUNTED })).toEqual({ unpriced: ["gemini-3.1-pro-preview"] });
  });

  it("gives nothing for a visit that counted nothing", () => {
    expect(pricedBy(GEMINI, {})).toEqual({});
  });

  it("gives nothing for a visit with no agent definition", () => {
    expect(pricedBy(null, { usage: COUNTED })).toEqual({});
  });
});
