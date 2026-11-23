import { describe, expect, it } from "vitest";
import { withSettings } from "./agent-file-text.js";

describe("withSettings", () => {
  it("rewrites image to acme/agent:3 keeping comments and key order", () => {
    const text =
      "---\n# the image the agent runs in\nimage: acme/agent:2\ntimeout_minutes: 10 # minutes\n---\nWork.\n";

    expect(withSettings(text, { image: "acme/agent:3", timeout_minutes: 10 })).toBe(
      "---\n# the image the agent runs in\nimage: acme/agent:3\ntimeout_minutes: 10 # minutes\n---\nWork.\n",
    );
  });

  it("drops model when settings leave it out, keeping comments and key order", () => {
    const text =
      "---\n# the image the agent runs in\nimage: acme/agent:2\ntimeout_minutes: 10 # minutes\nmodel: claude-sonnet-5-5\n---\nWork.\n";

    expect(withSettings(text, { image: "acme/agent:2", timeout_minutes: 10 })).toBe(
      "---\n# the image the agent runs in\nimage: acme/agent:2\ntimeout_minutes: 10 # minutes\n---\nWork.\n",
    );
  });
});
