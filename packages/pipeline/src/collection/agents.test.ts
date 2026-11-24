import { describe, expect, it } from "vitest";
import { extendedPrompt } from "./agents.js";

describe("extendedPrompt", () => {
  it.each([
    ["Work ENG-1.", "Also check the tests.", "Work ENG-1.\n\nAlso check the tests."],
    ["Work ENG-1.", "\nAlso check the tests.", "Work ENG-1.\n\n\nAlso check the tests."],
  ])("joins %j and %j into %j", (base, extra, expected) => {
    expect(extendedPrompt(base, extra)).toEqual(expected);
  });
});
