// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";

describe("Inspector Prompt panel", () => {
  it("shows the prompt Review the pull request. in the Prompt panel when the Prompt tab is pressed", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Review the pull request.", settings: {} },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    expect(within(screen.getByRole("tabpanel", { name: "Prompt" })).getByText("Review the pull request.")).toBeTruthy();
  });

  it("shows 'Review the pull request {diff}.' and 'Then reply.' as two paragraphs for the prompt wrapped after 'pull'", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Review the pull\nrequest {diff}.\n\nThen reply.", settings: {} },
      placeholders: {
        placeholders: [{ name: "diff", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = screen.getByRole("tabpanel", { name: "Prompt" });

    expect(promptPanel.querySelector("section p")?.textContent).toBe("Review the pull request {diff}.\n\nThen reply.");
  });

  it("marks {diff} as filled in the Prompt panel for the prompt Review {diff} now.", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Review {diff} now.", settings: {} },
      placeholders: {
        placeholders: [{ name: "diff", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const marks = within(screen.getByRole("tabpanel", { name: "Prompt" })).getAllByRole("mark");

    expect(marks.map((mark) => ({ text: mark.textContent, state: mark.getAttribute("data-state") }))).toEqual([
      { text: "{diff}", state: "filled" },
    ]);
  });

  it("marks {review.notes} as filled in the Prompt panel for the prompt Use {review.notes} here.", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Use {review.notes} here.", settings: {} },
      placeholders: {
        placeholders: [{ name: "review.notes", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const marks = within(screen.getByRole("tabpanel", { name: "Prompt" })).getAllByRole("mark");

    expect(marks.map((mark) => ({ text: mark.textContent, state: mark.getAttribute("data-state") }))).toEqual([
      { text: "{review.notes}", state: "filled" },
    ]);
  });

  it("tabulates {diff} as need-path, filled, by fetch in the Prompt panel Placeholders table", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Review {diff}.", settings: {} },
      placeholders: {
        placeholders: [{ name: "diff", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const table = within(screen.getByRole("tabpanel", { name: "Prompt" })).getByRole("table", { name: "Placeholders" });
    const tableRows = within(table).getAllByRole("row");

    expect(tableRows.map((tableRow) => Array.from(tableRow.children, (cell) => cell.textContent))).toEqual([
      ["name", "source", "state", "filled by"],
      ["diff", "need-path", "filled", "fetch"],
    ]);
  });

  it("lists ticket and repo under Needs the prompt never uses for the prompt Review.", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Review.", settings: {} },
      placeholders: { placeholders: [], unused: ["ticket", "repo"] },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const unusedList = within(screen.getByRole("tabpanel", { name: "Prompt" })).getByRole("list", {
      name: "Needs the prompt never uses",
    });

    expect(within(unusedList).getAllByRole("listitem").map((need) => need.textContent)).toEqual(["ticket", "repo"]);
  });

  it("renders <img src=x onerror=alert(1)> {diff} as text with no img element in the Prompt panel", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "<img src=x onerror=alert(1)> {diff}", settings: {} },
      placeholders: {
        placeholders: [{ name: "diff", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = screen.getByRole("tabpanel", { name: "Prompt" });

    expect({
      text: promptPanel.querySelector("p")?.textContent,
      images: promptPanel.querySelectorAll("img").length,
    }).toEqual({ text: "<img src=x onerror=alert(1)> {diff}", images: 0 });
  });

  it("shows Hi {x}. as plain text with no marks, an empty Placeholders table and no unused needs when the node has no placeholders", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: null, prompt: "Hi {x}.", settings: {} },
    });

    render(<Inspector node={reviewerNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = within(screen.getByRole("tabpanel", { name: "Prompt" }));

    expect({
      text: promptPanel.getByText("Hi {x}.").textContent,
      marks: promptPanel.queryAllByRole("mark").length,
      rows: within(promptPanel.getByRole("table", { name: "Placeholders" })).getAllByRole("row").length,
      unused: within(promptPanel.getByRole("list", { name: "Needs the prompt never uses" })).queryAllByRole("listitem").length,
    }).toEqual({ text: "Hi {x}.", marks: 0, rows: 1, unused: 0 });
  });

  it("hides the marked prompt Review {diff} now. once Edit prompt opens it in the textbox", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: "v1", prompt: "Review {diff} now.", settings: {} },
      placeholders: {
        placeholders: [{ name: "diff", source: "need-path", state: "filled", filledBy: ["fetch"], path: [] }],
        unused: [],
      },
    });

    render(<Inspector node={reviewerNode} actions={{ savePrompt: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = within(screen.getByRole("tabpanel", { name: "Prompt" }));
    const markedBefore = promptPanel.queryAllByRole("mark").length;
    await userEvent.click(promptPanel.getByRole("button", { name: "Edit prompt" }));

    expect([markedBefore, promptPanel.queryAllByRole("mark").length]).toEqual([1, 0]);
  });

  it("shows 'Review {diff} now.' again after ' edited' is typed, Cancel pressed and Edit prompt reopened", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: "v1", prompt: "Review {diff} now.", settings: {} },
    });

    render(<Inspector node={reviewerNode} actions={{ savePrompt: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = within(screen.getByRole("tabpanel", { name: "Prompt" }));
    await userEvent.click(promptPanel.getByRole("button", { name: "Edit prompt" }));
    await userEvent.type(promptPanel.getByRole("textbox"), " edited");
    await userEvent.click(promptPanel.getByRole("button", { name: "Cancel" }));
    await userEvent.click(promptPanel.getByRole("button", { name: "Edit prompt" }));

    expect((promptPanel.getByRole("textbox") as HTMLTextAreaElement).value).toEqual("Review {diff} now.");
  });

  it("shows 'Also check the tests.' under agents/reviewer.extra.md before its editor is opened", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: "v1", prompt: "Review the pull request.", settings: {} },
      extra: { file: "agents/reviewer.extra.md", text: "Also check the tests.", version: "v2" },
    });

    render(<Inspector node={reviewerNode} actions={{ savePrompt: async () => undefined, saveExtra: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    expect(screen.getByRole("region", { name: "agents/reviewer.extra.md" }).textContent).toMatch("Also check the tests.");
  });

  it("shows Save prompt only after ' edited' is typed into the opened prompt", async () => {
    const reviewerNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      agent: { name: "reviewer", file: "agents/reviewer.md", version: "v1", prompt: "Review {diff} now.", settings: {} },
    });

    render(<Inspector node={reviewerNode} actions={{ savePrompt: async () => undefined }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptPanel = within(screen.getByRole("tabpanel", { name: "Prompt" }));
    await userEvent.click(promptPanel.getByRole("button", { name: "Edit prompt" }));
    const saveBeforeTyping = promptPanel.queryByRole("button", { name: "Save prompt" }) !== null;
    await userEvent.type(promptPanel.getByRole("textbox"), " edited");
    const saveAfterTyping = promptPanel.queryByRole("button", { name: "Save prompt" }) !== null;

    expect([saveBeforeTyping, saveAfterTyping]).toEqual([false, true]);
  });
});
