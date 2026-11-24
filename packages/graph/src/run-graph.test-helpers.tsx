import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";

export async function renderGraph(ui: React.ReactElement) {
  const rendered = render(ui);
  await waitFor(() => expect(rendered.container.querySelector("[data-node]")).not.toBeNull());

  return rendered;
}

export const nodeEl = (container: HTMLElement, id: string) => container.querySelector(`[data-node="${id}"]`) as HTMLElement;
export const edgeEl = (container: HTMLElement, key: string) => container.querySelector(`[data-edge="${key}"]`) as HTMLElement;
export const labelOf = (container: HTMLElement, key: string) => container.querySelector(`[data-edge-label="${key}"]`)?.textContent ?? "";
