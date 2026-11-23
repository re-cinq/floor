import { describe, it, expect } from "vitest";
import { keyAction, wheelAction } from "./viewport-input";

describe("wheelAction", () => {
  it("gives pinched at 500, 500 for a Cmd wheel of -100", () => {
    const cmdWheel = { ctrlKey: false, metaKey: true, deltaX: 0, deltaY: -100, clientX: 500, clientY: 500 };

    expect(wheelAction(cmdWheel, { left: 0, top: 0 })).toEqual({ type: "pinched", anchor: { x: 500, y: 500 }, delta: -100 });
  });
});

describe("keyAction", () => {
  it.each([
    { name: "zoomed out", key: "-", action: { type: "zoomed", direction: "out" } },
    { name: "fit", key: "0", action: { type: "fit" } },
  ])("gives $name for $key", ({ key, action }) => {
    expect(keyAction(key)).toEqual(action);
  });
});
