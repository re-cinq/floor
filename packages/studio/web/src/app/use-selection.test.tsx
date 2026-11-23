// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSelection } from "./use-selection";

afterEach(() => {
  window.location.hash = "";
});

describe("useSelection", () => {
  it("starts from the line and node in the fragment", () => {
    window.location.hash = "#socket=ws%3A%2F%2F127.0.0.1%3A1&token=abc&line=flow&node=work";
    const { result } = renderHook(() => useSelection());

    expect(result.current[0]).toEqual({ line: "flow", node: "work" });
  });

  it("writes a selection into the fragment beside the socket and the token", () => {
    window.location.hash = "#socket=ws%3A%2F%2F127.0.0.1%3A1&token=abc";
    const { result } = renderHook(() => useSelection());

    act(() => result.current[1]({ line: "flow", node: "work" }));

    expect([result.current[0], window.location.hash]).toEqual([{ line: "flow", node: "work" }, "#socket=ws%3A%2F%2F127.0.0.1%3A1&token=abc&line=flow&node=work"]);
  });

  it("follows the fragment when the address is changed by hand", () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      window.location.hash = "#token=abc&line=other";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current[0]).toEqual({ line: "other" });
  });
});
