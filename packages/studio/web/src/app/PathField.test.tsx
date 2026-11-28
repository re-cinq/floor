// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PathField from "./PathField";

function renderWorkspaceField(error?: string) {
  render(<PathField label="Workspace folder" browseLabel="Browse" mode="folder" value="" onChange={() => undefined} listFolder={undefined} error={error} />);
}

describe("PathField", () => {
  it("offers no Browse button for Workspace folder when there is no way to list folders", () => {
    renderWorkspaceField();

    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("marks Workspace folder invalid and described by Choose a workspace folder when that is its error", () => {
    renderWorkspaceField("Choose a workspace folder");

    const field = screen.getByRole("textbox", { name: "Workspace folder", description: "Choose a workspace folder" });

    expect(field.getAttribute("aria-invalid")).toEqual("true");
  });
});
