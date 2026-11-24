// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
