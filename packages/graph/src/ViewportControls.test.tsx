// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ViewportControls from "./ViewportControls";

describe("ViewportControls", () => {
  it("draws each button as one hidden icon named and titled by its label, with no text", () => {
    render(<ViewportControls dispatch={() => undefined} />);

    const buttons = screen.getAllByRole("button").map((button) => ({
      name: button.getAttribute("aria-label"),
      title: button.getAttribute("title"),
      text: button.textContent,
      icons: button.querySelectorAll('svg[aria-hidden="true"]').length,
    }));

    expect(buttons).toEqual([
      { name: "Zoom in", title: "Zoom in", text: "", icons: 1 },
      { name: "Zoom out", title: "Zoom out", text: "", icons: 1 },
      { name: "Fit", title: "Fit", text: "", icons: 1 },
    ]);
  });

  it("draws Main path pressed when onToggleMainPath is given with mainPathOn", () => {
    const { container } = render(<ViewportControls dispatch={() => undefined} mainPathOn onToggleMainPath={() => undefined} />);

    expect(within(container).getByRole("button", { name: "Main path" }).getAttribute("aria-pressed")).toEqual("true");
  });

  it("calls onToggleMainPath once on a press of Main path", () => {
    const calls: string[] = [];
    const { container } = render(<ViewportControls dispatch={() => undefined} mainPathOn onToggleMainPath={() => calls.push("toggle")} />);
    fireEvent.click(within(container).getByRole("button", { name: "Main path" }));

    expect(calls).toEqual(["toggle"]);
  });

  it("draws no Main path button when onToggleMainPath is missing", () => {
    const { container } = render(<ViewportControls dispatch={() => undefined} mainPathOn />);

    expect(within(container).queryByRole("button", { name: "Main path" })).toBeNull();
  });

  it("draws Compact stops pressed when onToggleCompactStops is given with compactStopsOn", () => {
    const { container } = render(<ViewportControls dispatch={() => undefined} compactStopsOn onToggleCompactStops={() => undefined} />);

    expect(within(container).getByRole("button", { name: "Compact stops" }).getAttribute("aria-pressed")).toEqual("true");
  });

  it("calls onToggleCompactStops once on a press of Compact stops", () => {
    const calls: string[] = [];
    const { container } = render(<ViewportControls dispatch={() => undefined} compactStopsOn onToggleCompactStops={() => calls.push("toggle")} />);
    fireEvent.click(within(container).getByRole("button", { name: "Compact stops" }));

    expect(calls).toEqual(["toggle"]);
  });

  it("draws no Compact stops button when onToggleCompactStops is missing", () => {
    const { container } = render(<ViewportControls dispatch={() => undefined} compactStopsOn />);

    expect(within(container).queryByRole("button", { name: "Compact stops" })).toBeNull();
  });
});
