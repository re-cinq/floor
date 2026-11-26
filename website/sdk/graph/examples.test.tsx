import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import App from "./App";

test("selecting greet displays the greeting station description", async () => {
  const screen = await render(<App />);
  await screen.getByRole("button", { name: /^greet,/ }).click();
  await expect.element(screen.getByRole("status", { name: "Selected node" })).toHaveTextContent("Produces a greeting from the supplied name.");
});

test("a successful visit shows done and hides broken until Whole line is selected", async () => {
  const screen = await render(<App />);
  const broken = screen.getByRole("button", { name: /^broken,/ });
  await expect.element(broken).toBeVisible();
  await screen.getByRole("checkbox", { name: "Show completed run" }).click();
  await expect.element(screen.getByRole("button", { name: /^done,/ })).toBeVisible();
  await expect.element(broken).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Whole line" }).click();
  await expect.element(broken).toBeVisible();
});
