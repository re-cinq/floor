// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PathField from "./PathField";

describe("PathField", () => {
  it("offers no Browse button for Workspace folder when there is no way to list folders", () => {
    render(<PathField label="Workspace folder" browseLabel="Browse" mode="folder" value="" onChange={() => undefined} listFolder={undefined} />);

    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
