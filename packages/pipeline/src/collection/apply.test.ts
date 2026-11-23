import { describe, expect, it } from "vitest";
import { agentDefinitionsOf } from "./apply.js";
import type { OverlayAgent } from "./agents.js";

const greeter: OverlayAgent = {
  source: "collection-new",
  settings: { model: "claude-sonnet-5-5", image: "node:22", timeout_minutes: 10, prices: { "claude-sonnet-5-5": { input_per_million: 3, output_per_million: 15 } }, prompt: "Greet {name}." },
};

describe("agentDefinitionsOf", () => {
  it("spells an agent's settings as the floor does", () => {
    expect(agentDefinitionsOf(new Map([["greeter", greeter]]), new Map())).toEqual([
      {
        id: "greeter",
        body: { settings: { model: "claude-sonnet-5-5", image: "node:22", timeoutMinutes: 10, prices: { "claude-sonnet-5-5": { inputPerMillion: 3, outputPerMillion: 15 } }, prompt: "Greet {name}." } },
      },
    ]);
  });

  it("keeps the repository variants the floor holds for the agent", () => {
    const held = new Map([["greeter", { settings: { prompt: "old", image: "old", timeoutMinutes: 1 }, variants: { "github.com/acme/shop": { model: "claude-opus-5-5" } } }]]);
    const [definition] = agentDefinitionsOf(new Map([["greeter", greeter]]), held);

    expect(definition.body).toMatchObject({ settings: { prompt: "Greet {name}.", timeoutMinutes: 10 }, variants: { "github.com/acme/shop": { model: "claude-opus-5-5" } } });
  });
});
