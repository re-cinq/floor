import { describe, it, expect } from "vitest";
import { parseFragment, withExactSelection, withSelection } from "./fragment";

const SOCKET = "ws://127.0.0.1:4100";

describe("parseFragment", () => {
  it("reads the socket, the token, the line and the node from the fragment", () => {
    const hash = `#socket=${encodeURIComponent(SOCKET)}&token=abc123&line=feature-planning&node=analyze`;

    expect(parseFragment(hash)).toEqual({ socket: SOCKET, token: "abc123", line: "feature-planning", node: "analyze" });
  });

  it("reads an empty fragment as a page that was told nothing", () => {
    expect(parseFragment("")).toEqual({});
  });

  it("leaves out a part that is empty", () => {
    expect(parseFragment("#socket=&token=abc&line=")).toEqual({ token: "abc" });
  });
});

describe("withSelection", () => {
  const launch = `#socket=${encodeURIComponent(SOCKET)}&token=abc123`;

  it("adds the line and the node beside the socket and the token", () => {
    expect(parseFragment(withSelection(launch, { line: "flow", node: "work" }))).toEqual({ socket: SOCKET, token: "abc123", line: "flow", node: "work" });
  });

  it("drops the node when only a line is selected, and both when nothing is", () => {
    const placed = withSelection(launch, { line: "flow", node: "work" });

    expect([parseFragment(withSelection(placed, { line: "flow" })), parseFragment(withSelection(placed, {}))]).toEqual([
      { socket: SOCKET, token: "abc123", line: "flow" },
      { socket: SOCKET, token: "abc123" },
    ]);
  });

  it("keeps a part it does not know", () => {
    expect(withSelection("#token=abc&tab=events", { line: "flow" })).toBe("#token=abc&tab=events&line=flow");
  });

  it("keeps ids with characters a fragment must encode", () => {
    expect(parseFragment(withSelection(launch, { line: "a&b=c", node: "d e" }))).toMatchObject({ line: "a&b=c", node: "d e" });
  });
});

describe("withExactSelection", () => {
  it("keeps the edge key review|done|failed of a selected line", () => {
    const { line, node, edge, tab } = parseFragment(withExactSelection("#token=abc", { line: "code-review", edge: "review|done|failed" }));

    expect({ line, node, edge, tab }).toEqual({ line: "code-review", node: undefined, edge: "review|done|failed", tab: undefined });
  });
});
