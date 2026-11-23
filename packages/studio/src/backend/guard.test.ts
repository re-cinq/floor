import { describe, expect, it } from "vitest";
import { upgradeRefusal } from "./guard.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PAGE = "http://127.0.0.1:5000";

describe("upgradeRefusal", () => {
  it("accepts the right token from a client that sends no Origin", () => {
    expect(upgradeRefusal({ url: `/?token=${TOKEN}`, origin: undefined, token: TOKEN, origins: [] })).toBeUndefined();
  });

  it("accepts the right token from an Origin in the allowed list", () => {
    expect(upgradeRefusal({ url: `/?token=${TOKEN}`, origin: PAGE, token: TOKEN, origins: [PAGE] })).toBeUndefined();
  });

  it("refuses with 401 a url with no token", () => {
    expect(upgradeRefusal({ url: "/", origin: undefined, token: TOKEN, origins: [] })).toEqual({ status: 401, reason: "the socket needs the launch token" });
  });

  it("refuses with 401 a token of another length than the launch token", () => {
    expect(upgradeRefusal({ url: "/?token=short", origin: undefined, token: TOKEN, origins: [] })).toEqual({ status: 401, reason: "the socket needs the launch token" });
  });

  it("refuses with 403 an Origin that is not in the allowed list, the token right", () => {
    expect(upgradeRefusal({ url: `/?token=${TOKEN}`, origin: "https://evil.example", token: TOKEN, origins: [PAGE] })).toEqual({ status: 403, reason: "a page of another origin may not use this socket" });
  });

  it("refuses with 403 any Origin when none is allowed", () => {
    expect(upgradeRefusal({ url: `/?token=${TOKEN}`, origin: PAGE, token: TOKEN, origins: [] })).toMatchObject({ status: 403 });
  });

  it("refuses with 401 a request that has no url at all", () => {
    expect(upgradeRefusal({ url: undefined, origin: undefined, token: TOKEN, origins: [] })).toMatchObject({ status: 401 });
  });
});
