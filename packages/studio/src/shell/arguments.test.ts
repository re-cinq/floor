import { describe, expect, it } from "vitest";
import { parseStudioArguments } from "./arguments.js";

describe("parseStudioArguments", () => {
  it("runs on the current directory with a free port, no host key and the browser opened, for no arguments", () => {
    expect(parseStudioArguments([])).toEqual({ kind: "run", dir: ".", port: 0, hostKeys: [], open: true });
  });

  it("reads the directory, the port, every host key and --no-open", () => {
    expect(parseStudioArguments(["lines", "--port", "4000", "--host-key", "review_required", "--host-key", "execution_mode", "--no-open"])).toEqual({
      kind: "run",
      dir: "lines",
      port: 4000,
      hostKeys: ["review_required", "execution_mode"],
      open: false,
    });
  });

  it("answers help for --help", () => {
    expect(parseStudioArguments(["--help"])).toEqual({ kind: "help" });
  });

  it("names an option it does not know", () => {
    expect(parseStudioArguments(["--colour"])).toMatchObject({ kind: "bad", reason: expect.stringContaining("--colour") });
  });

  it("refuses a second directory", () => {
    expect(parseStudioArguments(["one", "two"])).toEqual({ kind: "bad", reason: "one directory at most: got one, two" });
  });

  it.each(["abc", "-1", "70000", "1.5"])("refuses the port %s", (port) => {
    expect(parseStudioArguments([`--port=${port}`])).toEqual({ kind: "bad", reason: "--port needs a whole number from 0 to 65535" });
  });
});
