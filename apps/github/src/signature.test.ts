import { describe, expect, it } from "vitest";
import { isSignedBy, signatureOf } from "./signature.js";

const SECRET = "webhook-secret";
const BODY = Buffer.from('{"action":"opened"}');

describe("isSignedBy", () => {
  it("accepts a body signed with the hook's secret", () => {
    expect(isSignedBy(SECRET, BODY, signatureOf(BODY, SECRET))).toBe(true);
  });

  it("matches what GitHub sends for the same body and secret", () => {
    expect(signatureOf(Buffer.from("Hello, World!"), "It's a Secret to Everybody")).toBe("sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17");
  });

  it("forged sender: refuses a body signed with another secret", () => {
    expect(isSignedBy(SECRET, BODY, signatureOf(BODY, "someone-else"))).toBe(false);
  });

  it("tampered body: refuses a body changed after it was signed", () => {
    expect(isSignedBy(SECRET, Buffer.from('{"action":"closed"}'), signatureOf(BODY, SECRET))).toBe(false);
  });

  it("refuses a delivery with no signature at all", () => {
    expect(isSignedBy(SECRET, BODY, undefined)).toBe(false);
  });

  it("refuses a signature of another kind", () => {
    expect(isSignedBy(SECRET, BODY, "sha1=abc")).toBe(false);
  });
});
