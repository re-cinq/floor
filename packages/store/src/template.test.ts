import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template.js";

describe("renderTemplate", () => {
  it("fills each placeholder from the scope", () => {
    expect(renderTemplate("{repository}@{head_ref}", { repository: "github.com/re-cinq/lore", head_ref: "main" })).toBe("github.com/re-cinq/lore@main");
  });

  it("renders a number and a boolean as their text", () => {
    expect(renderTemplate("{number}/{draft}", { number: 412, draft: false })).toBe("412/false");
  });

  it("leaves text that is not a placeholder alone", () => {
    expect(renderTemplate("{ not one } and {}", {})).toBe("{ not one } and {}");
  });

  it("refuses a name the scope does not carry", () => {
    expect(() => renderTemplate("{missing}", {})).toThrow(/names \{missing\}/);
  });

  it("refuses an object where text belongs", () => {
    expect(() => renderTemplate("{pull_request}", { pull_request: { url: "u" } })).toThrow(/is not text/);
  });

  it("second-order injection: a value holding a placeholder is not expanded again", () => {
    expect(renderTemplate("{title}", { title: "{secret}", secret: "hunter2" })).toBe("{secret}");
  });

  it("prototype reach: {constructor} is refused, not read from Object.prototype", () => {
    expect(() => renderTemplate("{constructor}", {})).toThrow(/names \{constructor\}/);
  });

  it("prototype reach: {__proto__} is refused", () => {
    expect(() => renderTemplate("{__proto__}", {})).toThrow(/names \{__proto__\}/);
  });

  it("oversized value: a render past 4 KB is refused, not truncated", () => {
    expect(() => renderTemplate("{body}", { body: "x".repeat(4097) })).toThrow(/over 4096 bytes/);
  });
});
