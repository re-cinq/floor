import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED = { FLOOR_SERVICE_TOKEN: "service", FLOOR_VISIT_TOKEN_SECRET: "secret" };
const PROVIDER_URL = "http://lore/git-credentials";

describe("loadConfig", () => {
  it("refuses to start with a git credential provider and no token for it", () => {
    expect(() => loadConfig({ ...REQUIRED, FLOOR_GIT_CREDENTIAL_URL: PROVIDER_URL })).toThrow(
      new Error("missing required environment variable FLOOR_GIT_CREDENTIAL_TOKEN"),
    );
  });

  it("starts with a provider and its token", () => {
    const config = loadConfig({ ...REQUIRED, FLOOR_GIT_CREDENTIAL_URL: PROVIDER_URL, FLOOR_GIT_CREDENTIAL_TOKEN: "provider-token" });

    expect(config).toMatchObject({ gitCredentialUrl: PROVIDER_URL, gitCredentialToken: "provider-token" });
  });

  it("starts with no provider at all", () => {
    const config = loadConfig(REQUIRED);

    expect(config).toMatchObject({ gitCredentialUrl: undefined, gitCredentialToken: undefined });
  });
});
