import { describe, expect, it } from "vitest";
import { settingsWithEnvironment, withEnvironment } from "./environment.js";

const ENVIRONMENT = { LORE_MCP_URL: "https://mcp.example/mcp", LORE_AGENT_IMAGE: "acme/agent:2" };

describe("withEnvironment", () => {
  it("fills ${LORE_MCP_URL} with the value given", () => {
    expect(withEnvironment("url: ${LORE_MCP_URL}", ENVIRONMENT)).toEqual("url: https://mcp.example/mcp");
  });

  it("fills every occurrence of a name and every name in the text", () => {
    expect(withEnvironment("${LORE_AGENT_IMAGE} ${LORE_MCP_URL} ${LORE_AGENT_IMAGE}", ENVIRONMENT)).toEqual("acme/agent:2 https://mcp.example/mcp acme/agent:2");
  });

  it("leaves ${lower} and $LORE_MCP_URL as written, since neither names a variable", () => {
    expect(withEnvironment("${lower} $LORE_MCP_URL", ENVIRONMENT)).toEqual("${lower} $LORE_MCP_URL");
  });

  it("throws naming LORE_AGENT_IMAGE when it is unset", () => {
    expect(() => withEnvironment("image: ${LORE_AGENT_IMAGE}", {})).toThrow(new Error("LORE_AGENT_IMAGE is not set, and a pipeline names it"));
  });

  it("throws naming LORE_AGENT_IMAGE when it is set to an empty string", () => {
    expect(() => withEnvironment("image: ${LORE_AGENT_IMAGE}", { LORE_AGENT_IMAGE: "" })).toThrow(new Error("LORE_AGENT_IMAGE is not set, and a pipeline names it"));
  });
});

describe("settingsWithEnvironment", () => {
  it("fills a name in a nested key and in a list, and leaves the prompt as written", () => {
    const settings = { image: "${LORE_AGENT_IMAGE}", config: { mcp: { url: "${LORE_MCP_URL}" }, args: ["--image=${LORE_AGENT_IMAGE}"] }, prompt: "Call ${LORE_MCP_URL}." };

    expect(settingsWithEnvironment(settings, ENVIRONMENT)).toEqual({
      image: "acme/agent:2",
      config: { mcp: { url: "https://mcp.example/mcp" }, args: ["--image=acme/agent:2"] },
      prompt: "Call ${LORE_MCP_URL}.",
    });
  });

  it("keeps numbers and booleans as they are", () => {
    expect(settingsWithEnvironment({ timeout_minutes: 10, flag: true, prompt: null }, {})).toEqual({ timeout_minutes: 10, flag: true, prompt: null });
  });

  it("throws naming the variable when a setting names one that is unset", () => {
    expect(() => settingsWithEnvironment({ image: "${LORE_AGENT_IMAGE}", prompt: null }, {})).toThrow(new Error("LORE_AGENT_IMAGE is not set, and a pipeline names it"));
  });
});
