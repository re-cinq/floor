import { describe, expect, it } from "vitest";
import { renderPrompt } from "./render-prompt.js";

describe("renderPrompt", () => {
  it.each<{ template: string; parameters: Record<string, string>; rendered: string }>([
    { template: "Fix {ticket}.", parameters: { ticket: "ENG-1" }, rendered: "Fix ENG-1." },
    { template: "Repo {repo} branch {repo}", parameters: { repo: "main" }, rendered: "Repo main branch main" },
    { template: "Fix {ticket}.", parameters: {}, rendered: "Fix {ticket}." },
    { template: "Unknown {missing} stays", parameters: { other: "value" }, rendered: "Unknown {missing} stays" },
    { template: "", parameters: { other: "value" }, rendered: "" },
    { template: "No placeholders here", parameters: {}, rendered: "No placeholders here" },
    { template: "brace { not closed", parameters: { other: "value" }, rendered: "brace { not closed" },
    { template: "empty {} braces", parameters: { other: "value" }, rendered: "empty {} braces" },
    { template: "Read {plan.notes_path-1}", parameters: { "plan.notes_path-1": "/workspace/notes.md" }, rendered: "Read /workspace/notes.md" },
    { template: "Not {toString}", parameters: {}, rendered: "Not {toString}" },
  ])("renders $template with $parameters as $rendered", ({ template, parameters, rendered }) => {
    expect(renderPrompt(template, parameters)).toEqual(rendered);
  });
});
