import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";

type Settings = Record<string, unknown>;

/** Renders the reviewer agent with these settings, opens its Settings tab, and returns a reader of the last save. */
export async function openReviewerSettings(settings: Settings, skillNames: string[] = []): Promise<() => Settings | undefined> {
  let saved: Settings | undefined;
  const reviewerNode = nodeView({
    id: "review",
    station: "review",
    kind: "agent",
    agent: { name: "reviewer", file: "agents/reviewer.md", version: "v1", prompt: "Review.", settings },
  });

  render(
    <Inspector
      node={reviewerNode}
      actions={{
        skillNames,
        saveSettings: (edited) => {
          saved = edited;

          return Promise.resolve();
        },
      }}
    />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Settings" }));

  return () => saved;
}
