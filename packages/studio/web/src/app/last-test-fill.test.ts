import { describe, expect, it } from "vitest";
import type { LastTest } from "@/socket/studio-connection";
import { enteredAfterLast, workspaceAfterLast } from "./last-test-fill";

const remembered: LastTest = { workspace: "/w/remembered", entered: { topic: "tides" } };

describe("filling the start screen from the last test", () => {
  it("keeps the typed workspace /typed/elsewhere over the remembered /w/remembered", () => {
    expect(workspaceAfterLast("/typed/elsewhere", remembered)).toEqual("/typed/elsewhere");
  });

  it("takes the remembered workspace /w/remembered when the typed one is empty", () => {
    expect(workspaceAfterLast("", remembered)).toEqual("/w/remembered");
  });

  it("keeps the typed inputs topic storms over the remembered topic tides", () => {
    expect(enteredAfterLast({ topic: "storms" }, remembered)).toEqual({ topic: "storms" });
  });

  it("takes the remembered inputs topic tides when no inputs are typed", () => {
    expect(enteredAfterLast({}, remembered)).toEqual({ topic: "tides" });
  });
});
