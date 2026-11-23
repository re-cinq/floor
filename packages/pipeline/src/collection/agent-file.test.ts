import { describe, expect, it } from "vitest";
import { floorSettingsOf, readAgentFile } from "./agent-file.js";

const REVIEW = [
  "---",
  "model: gemini-4-argon",
  "image: ${ACME_AGENT_IMAGE}",
  "timeout_minutes: 25",
  "tags: [review, cheap]",
  "prices:",
  "  gemini-4-argon:",
  "    input_per_million: 2",
  "    output_per_million: 10",
  "    cache_read_per_million: 0.5",
  "    cache_write_per_million: 2.5",
  "config:",
  "  max_turns: 150",
  "  skills_source: ${ACME_SKILLS_URL}",
  "  env:",
  "    ACME_TEST_POLICY: none",
  "---",
  "Review the pull request.",
  "",
  "Task: {description}",
  "",
].join("\n");

describe("readAgentFile", () => {
  it("reads review.md's frontmatter as its settings and its body as the prompt", () => {
    expect(readAgentFile("review", REVIEW)).toMatchObject({
      name: "review",
      frontmatter: { model: "gemini-4-argon", image: "${ACME_AGENT_IMAGE}", timeout_minutes: 25, tags: ["review", "cheap"] },
      prompt: "Review the pull request.\n\nTask: {description}\n",
    });
  });

  it("reads a file with an empty body as a null prompt", () => {
    const text = ["---", "timeout_minutes: 15", "config:", "  command: [acme-station, validate]", "---", ""].join("\n");

    expect(readAgentFile("def-validate", text)).toMatchObject({ name: "def-validate", prompt: null });
  });

  it("refuses general.md with a misspelled prompt_template key instead of dropping it", () => {
    const text = ["---", "prompt_tempalte: hi", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text)).toThrow(/general\.md.*prompt_tempalte/);
  });

  it("refuses general.md with no frontmatter", () => {
    expect(() => readAgentFile("general", "Do it.\n")).toThrow(new Error("general.md: missing the --- frontmatter block"));
  });

  it("refuses execution_mode, which is a key of a host", () => {
    const text = ["---", "execution_mode: station", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text)).toThrow(/general\.md.*execution_mode/);
  });

  it("refuses review_required, which is a key of a host", () => {
    const text = ["---", "review_required: true", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text)).toThrow(/general\.md.*review_required/);
  });

  it("refuses a price key it does not know", () => {
    const text = ["---", "prices:", "  opus: { input_per_million: 1, output_per_million: 2, cache_hit_per_million: 3 }", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text)).toThrow(/general\.md.*cache_hit_per_million/);
  });

  it("refuses tags that are not an array of strings", () => {
    const text = ["---", "tags: review", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text)).toThrow(/general\.md: [\s\S]*tags/);
  });

  it("accepts the keys named as host keys with any value, and keeps them in written", () => {
    const text = ["---", "execution_mode: station", "review_required: [maybe]", "timeout_minutes: 15", "---", "Do it.", ""].join("\n");

    expect(readAgentFile("general", text, ["execution_mode", "review_required"])).toMatchObject({
      frontmatter: { timeout_minutes: 15 },
      written: { execution_mode: "station", review_required: ["maybe"], timeout_minutes: 15 },
    });
  });

  it("refuses a key that is neither a base key nor a host key", () => {
    const text = ["---", "execution_mode: station", "mood: grim", "---", "Do it.", ""].join("\n");

    expect(() => readAgentFile("general", text, ["execution_mode"])).toThrow(/general\.md.*mood/);
  });
});

describe("floorSettingsOf", () => {
  it("builds review's settings from model, image, timeout, tags, prices and config in the file's order, prompt last", () => {
    const settings = floorSettingsOf(readAgentFile("review", REVIEW));

    expect(JSON.stringify(settings)).toEqual(
      JSON.stringify({
        model: "gemini-4-argon",
        image: "${ACME_AGENT_IMAGE}",
        timeout_minutes: 25,
        tags: ["review", "cheap"],
        prices: { "gemini-4-argon": { input_per_million: 2, output_per_million: 10, cache_read_per_million: 0.5, cache_write_per_million: 2.5 } },
        config: { max_turns: 150, skills_source: "${ACME_SKILLS_URL}", env: { ACME_TEST_POLICY: "none" } },
        prompt: "Review the pull request.\n\nTask: {description}\n",
      }),
    );
  });

  it("leaves a host key out of the settings", () => {
    const text = ["---", "execution_mode: station", "timeout_minutes: 15", "---", "Do it.", ""].join("\n");

    expect(floorSettingsOf(readAgentFile("general", text, ["execution_mode"]))).toEqual({ timeout_minutes: 15, prompt: "Do it.\n" });
  });
});
