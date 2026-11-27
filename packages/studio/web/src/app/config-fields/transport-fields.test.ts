import { describe, expect, it } from "vitest";
import { TRANSPORT_FIELDS } from "./transport-fields.js";

describe("TRANSPORT_FIELDS", () => {
  it("offers visit_token to http and sse servers and not to stdio", () => {
    const offered = (transport: string) =>
      TRANSPORT_FIELDS[transport]!.includes("visit_token");

    expect({
      http: offered("http"),
      sse: offered("sse"),
      stdio: offered("stdio"),
    }).toEqual({ http: true, sse: true, stdio: false });
  });
});
