// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SCHEME_KEY } from "./scheme";
import { useColorScheme } from "./use-color-scheme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-color-scheme");
});

describe("useColorScheme", () => {
  it("starts on auto and puts the resolved scheme on the page when nothing was remembered", () => {
    const { result } = renderHook(() => useColorScheme());

    expect([result.current.pref, document.documentElement.getAttribute("data-color-scheme")]).toEqual(["auto", "light"]);
  });

  it("starts on the remembered choice", () => {
    localStorage.setItem(SCHEME_KEY, "dark");
    const { result } = renderHook(() => useColorScheme());

    expect([result.current.pref, document.documentElement.getAttribute("data-color-scheme")]).toEqual(["dark", "dark"]);
  });

  it("applies a new choice to the page and remembers it for the next visit", () => {
    const { result } = renderHook(() => useColorScheme());

    act(() => result.current.choose("dark"));

    expect([result.current.pref, document.documentElement.getAttribute("data-color-scheme"), localStorage.getItem(SCHEME_KEY)]).toEqual(["dark", "dark", "dark"]);
  });
});
