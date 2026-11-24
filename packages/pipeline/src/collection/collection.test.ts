import { describe, expect, it } from "vitest";
import { SHIPPED_REVIEWER, TRIAGE_AGENT, agentNamed, linesAndRefusalsOf, overlayOf, pipelineYaml } from "./collection.fixtures.js";

describe("collectionOverlay", () => {
  it("appends an extension file to the shipped prompt of its agent", () => {
    const overlay = overlayOf({
      "code-review/agents/reviewer.extra.md": "Also check our naming rules.",
    });

    expect(overlay.agents).toEqual(
      new Map([
        [
          "reviewer",
          {
            source: "extended",
            settings: {
              ...SHIPPED_REVIEWER,
              prompt: "Review the diff.\n\nAlso check our naming rules.",
            },
          },
        ],
      ]),
    );
  });

  it("replaces a shipped agent wholesale with a full definition of the collection", () => {
    const overlay = overlayOf({
      "code-review/agents/reviewer.md":
        "---\nimage: acme/agent:2\ntimeout_minutes: 10\nmodel: opus\n---\nReview our way.\n",
    });

    expect(overlay.agents.get("reviewer")).toEqual({
      source: "replaced",
      settings: {
        image: "acme/agent:2",
        timeout_minutes: 10,
        model: "opus",
        prompt: "Review our way.\n",
      },
    });
  });

  it("adds an agent nothing ships as collection-new", () => {
    const overlay = overlayOf({
      "triage/agents/triager.md":
        "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nTriage.\n",
    });

    expect(agentNamed(overlay, "triager")?.source).toEqual("collection-new");
  });

  it("fills the environment into the settings of a collection agent and never into its prompt", () => {
    const overlay = overlayOf({
      "triage/agents/triager.md":
        "---\nimage: ${ACME_IMAGE}\ntimeout_minutes: 10\n---\nRun on ${ACME_IMAGE}.\n",
    });

    expect(agentNamed(overlay, "triager")?.settings).toEqual({
      image: "acme/agent:7",
      timeout_minutes: 10,
      prompt: "Run on ${ACME_IMAGE}.\n",
    });
  });

  it("refuses an extension of an agent nothing ships and records why", () => {
    const overlay = overlayOf({
      "triage/agents/triager.extra.md": "Be brief.",
    });

    expect({
      agents: [...overlay.agents.keys()],
      refused: overlay.refused,
    }).toEqual({
      agents: [],
      refused: [
        {
          path: "triage/agents/triager.extra.md",
          reason:
            "an extension needs a shipped agent, and nothing ships triager",
        },
      ],
    });
  });

  it("refuses a malformed agent file and still applies the others", () => {
    const overlay = overlayOf({
      "triage/agents/broken.md": "no frontmatter here",
      "triage/agents/triager.md":
        "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nTriage.\n",
    });

    expect({
      agents: [...overlay.agents.keys()],
      refused: overlay.refused,
    }).toEqual({
      agents: ["triager"],
      refused: [
        {
          path: "triage/agents/broken.md",
          reason: "broken.md: missing the --- frontmatter block",
        },
      ],
    });
  });

  it.each([
    ["image", "---\ntimeout_minutes: 10\n---\nTriage.\n"],
    ["timeout_minutes", "---\nimage: acme/agent:2\n---\nTriage.\n"],
    ["prompt", "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\n"],
  ])("refuses a full agent definition without %s", (field, text) => {
    const overlay = overlayOf({ "triage/agents/triager.md": text });

    expect(overlay.refused).toEqual([
      {
        path: "triage/agents/triager.md",
        reason: `triager has no ${field}, and a full agent definition needs a prompt, an image and timeout_minutes`,
      },
    ]);
  });

  it("refuses the extension when the same collection also has the full file of that agent", () => {
    const overlay = overlayOf({
      "code-review/agents/reviewer.md":
        "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nReview our way.\n",
      "code-review/agents/reviewer.extra.md": "More.",
    });

    expect({
      source: agentNamed(overlay, "reviewer")?.source,
      refused: overlay.refused,
    }).toEqual({
      source: "replaced",
      refused: [
        {
          path: "code-review/agents/reviewer.extra.md",
          reason: "reviewer is already set by code-review/agents/reviewer.md",
        },
      ],
    });
  });

  it("refuses an agent a second folder defines again", () => {
    const text =
      "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nTriage.\n";
    const overlay = overlayOf({
      "b/agents/triager.md": text,
      "a/agents/triager.md": text,
    });

    expect(overlay.refused).toEqual([
      {
        path: "b/agents/triager.md",
        reason: "triager is already set by a/agents/triager.md",
      },
    ]);
  });

  it("refuses an agent file naming an environment variable that is not set", () => {
    const overlay = overlayOf({
      "triage/agents/triager.md":
        "---\nimage: ${MISSING_IMAGE}\ntimeout_minutes: 10\n---\nTriage.\n",
    });

    expect(overlay.refused).toEqual([
      {
        path: "triage/agents/triager.md",
        reason: "MISSING_IMAGE is not set, and a pipeline names it",
      },
    ]);
  });

  it("parses a pipeline folder into a pipeline for the floor named after the folder", () => {
    const overlay = overlayOf({
      "triage/pipeline.yaml": pipelineYaml("triage", "triager"),
      "triage/agents/triager.md": TRIAGE_AGENT,
    });

    expect({
      lines: overlay.pipelines.map((pipeline) => pipeline.line?.id),
      stations: overlay.pipelines.flatMap((pipeline) =>
        pipeline.stations.map((station) => station.id),
      ),
      refused: overlay.refused,
    }).toEqual({ lines: ["triage"], stations: ["work"], refused: [] });
  });

  it("imports code-review/pipeline.yaml as the collection's version of the shipped line code-review", () => {
    expect(linesAndRefusalsOf({
      "code-review/pipeline.yaml": pipelineYaml("code-review", "reviewer"),
    })).toEqual({ lines: ["code-review"], refused: [] });
  });

  it("refuses code-review/assembly-line.yaml for optional on a produce, and imports no line", () => {
    const withOptional = pipelineYaml("code-review", "reviewer").replace("    produces: []\n", "    produces:\n      - name: report\n        kind: file\n        path: report.md\n        optional: true\n");

    expect(linesAndRefusalsOf({ "code-review/assembly-line.yaml": withOptional })).toEqual({
      lines: [],
      refused: [{ path: "code-review/assembly-line.yaml", reason: 'stations.work.produces[0]: unknown key "optional"' }],
    });
  });

  it("refuses code-review/pipeline.yml and code-review/agent/reviewer.md, naming the paths a collection reads", () => {
    const overlay = overlayOf({
      "code-review/pipeline.yml": pipelineYaml("code-review", "reviewer"),
      "code-review/agent/reviewer.md": TRIAGE_AGENT,
    });
    const reason =
      "a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md";

    expect({
      lines: overlay.pipelines.length,
      agents: overlay.agents.size,
      refused: overlay.refused,
    }).toEqual({
      lines: 0,
      agents: 0,
      refused: [
        { path: "code-review/agent/reviewer.md", reason },
        { path: "code-review/pipeline.yml", reason },
      ],
    });
  });

  it("refuses a pipeline whose line is not named after its folder", () => {
    const overlay = overlayOf({
      "triage/pipeline.yaml": pipelineYaml("sorting", "reviewer"),
    });

    expect(overlay.refused).toEqual([
      {
        path: "triage/pipeline.yaml",
        reason:
          "the folder triage must hold the pipeline of that name, and its line is sorting",
      },
    ]);
  });

  it("refuses a pipeline naming the agent ghost that neither the host ships nor the collection defines", () => {
    const overlay = overlayOf({
      "triage/pipeline.yaml": pipelineYaml("triage", "ghost"),
    });

    expect(overlay.refused).toEqual([
      {
        path: "triage/pipeline.yaml",
        reason:
          'station "work" names agent definition "ghost", and nothing defines it: a collection defines an agent in <line>/agents/<agent>.md',
      },
    ]);
  });

  it("refuses a pipeline file that is not a pipeline", () => {
    const overlay = overlayOf({ "triage/pipeline.yaml": "line: [" });

    expect(overlay.refused.map((refusal) => refusal.path)).toEqual([
      "triage/pipeline.yaml",
    ]);
  });

  it("accepts a pipeline naming a shipped agent the collection does not touch, and keeps its agents out of the pipeline", () => {
    const overlay = overlayOf({
      "triage/pipeline.yaml": pipelineYaml("triage", "reviewer"),
    });

    expect({
      lines: overlay.pipelines.map((pipeline) => pipeline.line?.id),
      agentDefinitions: overlay.pipelines.flatMap(
        (pipeline) => pipeline.agentDefinitions,
      ),
      refused: overlay.refused,
    }).toEqual({ lines: ["triage"], agentDefinitions: [], refused: [] });
  });

  it("counts the agents the collection sets, its pipelines and its extensions", () => {
    const overlay = overlayOf({
      "triage/pipeline.yaml": pipelineYaml("triage", "triager"),
      "triage/agents/triager.md": TRIAGE_AGENT,
      "triage/agents/reviewer.extra.md": "More.",
    });

    expect(overlay.counts).toEqual({ agents: 2, pipelines: 1, extensions: 1 });
  });

  it("leaves a shipped agent the collection does not name out of the overlay", () => {
    const overlay = overlayOf({
      "code-review/agents/reviewer.extra.md": "More.",
    });

    expect([...overlay.agents.keys()]).toEqual(["reviewer"]);
  });
});
