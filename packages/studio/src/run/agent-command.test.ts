import { describe, expect, it } from "vitest";
import { agentCommand } from "./agent-command.js";

type CommandInput = Parameters<typeof agentCommand>[0];

describe("agentCommand", () => {
  it.each<{ name: string; input: CommandInput; argv: string[] }>([
    {
      name: "claude with model and acceptEdits",
      input: { vendor: "claude", settings: { model: "claude-sonnet-5-5" }, prompt: "Fix ENG-1.", permission: "acceptEdits" },
      argv: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--setting-sources", "project", "--model", "claude-sonnet-5-5", "--permission-mode", "acceptEdits", "--", "Fix ENG-1."],
    },
    {
      name: "claude with max turns 30",
      input: { vendor: "claude", settings: { model: "claude-sonnet-5-5", maxTurns: 30 }, prompt: "Fix ENG-1.", permission: "acceptEdits" },
      argv: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--setting-sources", "project", "--model", "claude-sonnet-5-5", "--permission-mode", "acceptEdits", "--max-turns", "30", "--", "Fix ENG-1."],
    },
    {
      name: "claude without a model",
      input: { vendor: "claude", settings: {}, prompt: "Fix ENG-1.", permission: "acceptEdits" },
      argv: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--setting-sources", "project", "--permission-mode", "acceptEdits", "--", "Fix ENG-1."],
    },
    {
      name: "claude with disallowed tools Bash and WebFetch",
      input: { vendor: "claude", settings: { model: "claude-sonnet-5-5", disallowedTools: ["Bash", "WebFetch"] }, prompt: "Fix ENG-1.", permission: "acceptEdits" },
      argv: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--setting-sources", "project", "--model", "claude-sonnet-5-5", "--permission-mode", "acceptEdits", "--disallowedTools", "Bash", "--disallowedTools", "WebFetch", "--", "Fix ENG-1."],
    },
    {
      name: "claude bypassing permissions keeps disallowed tool Bash",
      input: { vendor: "claude", settings: { model: "claude-sonnet-5-5", disallowedTools: ["Bash"] }, prompt: "Fix ENG-1.", permission: "bypass" },
      argv: ["claude", "--print", "--verbose", "--output-format", "stream-json", "--setting-sources", "project", "--model", "claude-sonnet-5-5", "--dangerously-skip-permissions", "--disallowedTools", "Bash", "--", "Fix ENG-1."],
    },
    {
      name: "codex with model gpt-5 and acceptEdits",
      input: { vendor: "codex", settings: { model: "gpt-5" }, prompt: "Fix ENG-1.", permission: "acceptEdits" },
      argv: ["codex", "exec", "--json", "--model", "gpt-5", "--", "Fix ENG-1."],
    },
    {
      name: "codex with model gpt-5 bypassing approvals",
      input: { vendor: "codex", settings: { model: "gpt-5" }, prompt: "Fix ENG-1.", permission: "bypass" },
      argv: ["codex", "exec", "--json", "--model", "gpt-5", "--dangerously-bypass-approvals-and-sandbox", "--", "Fix ENG-1."],
    },
  ])("returns argv for $name", ({ input, argv }) => {
    expect(agentCommand(input)).toEqual(argv);
  });
});
