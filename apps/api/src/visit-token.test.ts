import { describe, expect, it } from "vitest";
import { mintVisitToken, verifyVisitToken } from "./visit-token.js";

const SECRET = "test-secret";
const NOW = new Date("2026-01-01T00:00:00Z");
const FUTURE_DEADLINE = new Date("2026-01-01T01:00:00Z");
const PAST_DEADLINE = new Date("2025-12-31T23:00:00Z");

describe("mintVisitToken and verifyVisitToken", () => {
  it("verifies a freshly minted token as the visit it names", () => {
    const token = mintVisitToken("visit-1", FUTURE_DEADLINE, SECRET);

    expect(verifyVisitToken(token, SECRET, NOW)?.visitId).toBe("visit-1");
  });

  it("refuses a token whose deadline already passed", () => {
    const token = mintVisitToken("visit-1", PAST_DEADLINE, SECRET);

    expect(verifyVisitToken(token, SECRET, NOW)).toBeNull();
  });

  it("refuses a token signed with a different secret", () => {
    const token = mintVisitToken("visit-1", FUTURE_DEADLINE, "other-secret");

    expect(verifyVisitToken(token, SECRET, NOW)).toBeNull();
  });

  it("refuses a tampered visit id", () => {
    const token = mintVisitToken("visit-1", FUTURE_DEADLINE, SECRET);
    const [, expiry, signature] = token.split(".");
    const tampered = `visit-2.${expiry}.${signature}`;

    expect(verifyVisitToken(tampered, SECRET, NOW)).toBeNull();
  });

  it("refuses a malformed token", () => {
    expect(verifyVisitToken("not-a-token", SECRET, NOW)).toBeNull();
  });
});
