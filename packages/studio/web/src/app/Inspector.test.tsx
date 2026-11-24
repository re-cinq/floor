// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inspector from "./Inspector";
import { nodeView } from "./inspector.fixtures";

function listedEntries(panel: string, list: string): (string | null)[] {
  const listItems = within(within(screen.getByRole("tabpanel", { name: panel })).getByRole("list", { name: list })).getAllByRole("listitem");

  return listItems.map((listItem) => listItem.textContent);
}

const workNode = nodeView({
  id: "work",
  station: "work",
  kind: "agent",
  description: "Does the work.",
  outcomes: ["done"],
  agent: { name: "worker", file: "agents/worker.md", version: null, prompt: null, settings: {} },
});

describe("Inspector", () => {
  it("offers Station, Events, Prompt, Model, Tools, MCP, Pod and Other for the agent node work", () => {
    render(<Inspector node={workNode} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Station", "Events", "Prompt", "Model", "Tools", "MCP", "Pod", "Other"]);
  });

  it("selects Station first and shows its panel for the agent node work", () => {
    render(<Inspector node={workNode} />);

    const selectedTab = screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

    expect({ selected: selectedTab?.textContent, panel: screen.queryByRole("tabpanel", { name: "Station" })?.getAttribute("role") }).toEqual({
      selected: "Station",
      panel: "tabpanel",
    });
  });

  it("selects Events and shows its panel when the Events tab is pressed", async () => {
    render(<Inspector node={workNode} />);

    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    const selectedTab = screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

    expect({ selected: selectedTab?.textContent, panel: screen.queryByRole("tabpanel", { name: "Events" })?.getAttribute("role") }).toEqual({
      selected: "Events",
      panel: "tabpanel",
    });
  });

  it("offers only Station and Events for the service node post-review", () => {
    const postReviewNode = nodeView({
      id: "post-review",
      station: "post-review",
      kind: "service",
      description: "Posts the review.",
      outcomes: ["posted"],
    });

    render(<Inspector node={postReviewNode} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Station", "Events"]);
  });

  it("lists the need ticket as filled by triage in the Station panel", () => {
    const needyNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      needs: [{ name: "ticket", kind: "value", coverage: { kind: "filled", producedBy: ["triage"] } }],
    });

    render(<Inspector node={needyNode} />);

    expect(listedEntries("Station", "Needs")).toEqual(["ticket: filled by triage"]);
  });

  it("lists the outcomes success, changes_requested and failed in the Station panel", () => {
    const reviewNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      outcomes: ["success", "changes_requested", "failed"],
    });

    render(<Inspector node={reviewNode} />);

    expect(listedEntries("Station", "Outcomes")).toEqual(["success", "changes_requested", "failed"]);
  });

  it("lists the produces review and verdict in the Station panel", () => {
    const producingNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      produces: [
        { name: "review", kind: "value", readBy: [] },
        { name: "verdict", kind: "value", readBy: [] },
      ],
    });

    render(<Inspector node={producingNode} />);

    expect(listedEntries("Station", "Produces")).toEqual(["review", "verdict"]);
  });

  it("lists the produce draft as read by review, publish in the Station panel", () => {
    const producingNode = nodeView({
      id: "write",
      station: "write",
      kind: "agent",
      produces: [{ name: "draft", kind: "value", readBy: ["review", "publish"] }],
    });

    render(<Inspector node={producingNode} />);

    expect(listedEntries("Station", "Produces")).toEqual(["draft: read by review, publish"]);
  });

  it("shows the description Reviews the pull request in the Station panel", () => {
    const describedNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      description: "Reviews the pull request",
    });

    render(<Inspector node={describedNode} />);

    expect(within(screen.getByRole("tabpanel", { name: "Station" })).getByText("Reviews the pull request")).toBeTruthy();
  });

  it("renders no paragraph in the Station panel when the node has no description", () => {
    const undescribedNode = nodeView({ id: "review", station: "review", kind: "agent" });

    render(<Inspector node={undescribedNode} />);

    expect(screen.getByRole("tabpanel", { name: "Station" }).querySelectorAll("p")).toHaveLength(0);
  });

  it("lists node.review.start under Started by in the Events panel", async () => {
    const reviewNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      events: { startedBy: [{ event: "node.review.start", origin: "walk" }], answeredBy: [], raises: [] },
    });

    render(<Inspector node={reviewNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Started by")).toEqual(["node.review.start, when an edge leads here"]);
  });

  it("lists origins under Started by: when an edge leads here, from outside the line", async () => {
    const reviewNode = nodeView({
      id: "review",
      station: "review",
      kind: "agent",
      events: {
        startedBy: [
          { event: "node.review.start", origin: "walk" },
          { event: "review.requested", origin: "outside" },
        ],
        answeredBy: [],
        raises: [],
      },
    });

    render(<Inspector node={reviewNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Started by")).toEqual([
      "node.review.start, when an edge leads here",
      "review.requested, from outside the line",
    ]);
  });

  it("lists pull_request.opened, when the line starts, if repo is re-cinq/floor under Started by", async () => {
    const entryNode = nodeView({
      id: "intake",
      station: "intake",
      kind: "agent",
      events: {
        startedBy: [{ event: "pull_request.opened", origin: "line-start", when: { repo: "re-cinq/floor" } }],
        answeredBy: [],
        raises: [],
      },
    });

    render(<Inspector node={entryNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Started by")).toEqual([
      "pull_request.opened, when the line starts, if repo is re-cinq/floor",
    ]);
  });

  it("lists check_run.completed, reports passed under Answered by in the Events panel", async () => {
    const checkedNode = nodeView({
      id: "wait-for-ci",
      station: "wait-for-ci",
      kind: "service",
      events: { startedBy: [], answeredBy: [{ event: "check_run.completed", outcome: "passed" }], raises: [] },
    });

    render(<Inspector node={checkedNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Answered by")).toEqual(["check_run.completed, reports passed"]);
  });

  it("lists station_run.dispatch under Raises in the Events panel", async () => {
    const dispatchingNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      events: { startedBy: [], answeredBy: [], raises: [{ kind: "event", event: "station_run.dispatch" }] },
    });

    render(<Inspector node={dispatchingNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Raises")).toEqual(["station_run.dispatch"]);
  });

  it("lists on success, node.review.start starts review under Raises for an outcome leading to review", async () => {
    const reviewedNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      events: {
        startedBy: [],
        answeredBy: [],
        raises: [
          { kind: "outcome", outcome: "success", leadsTo: { on: "success", node: "review", event: "node.review.start" } },
        ],
      },
    });

    render(<Inspector node={reviewedNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Raises")).toEqual(["on success, node.review.start starts review"]);
  });

  it("lists on failed, node.notify.start starts notify by the edge taken always under Raises for an always edge", async () => {
    const notifyingNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      events: {
        startedBy: [],
        answeredBy: [],
        raises: [
          { kind: "outcome", outcome: "failed", leadsTo: { on: "always", node: "notify", event: "node.notify.start" } },
        ],
      },
    });

    render(<Inspector node={notifyingNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Raises")).toEqual(["on failed, node.notify.start starts notify by the edge taken always"]);
  });

  it("lists on failed, no edge leads on: the run stops here under Raises for an outcome no edge takes", async () => {
    const failingNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      events: { startedBy: [], answeredBy: [], raises: [{ kind: "outcome", outcome: "failed", leadsTo: null }] },
    });

    render(<Inspector node={failingNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Raises")).toEqual(["on failed, no edge leads on: the run stops here"]);
  });

  it("lists when the run settles, starts the line release-notes, if outcome is success under Raises for a conditional line start", async () => {
    const lineStartingNode = nodeView({
      id: "work",
      station: "work",
      kind: "agent",
      events: {
        startedBy: [],
        answeredBy: [],
        raises: [{ kind: "starts-line", line: "release-notes", when: { outcome: "success" } }],
      },
    });

    render(<Inspector node={lineStartingNode} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));

    expect(listedEntries("Events", "Raises")).toEqual([
      "when the run settles, starts the line release-notes, if outcome is success",
    ]);
  });

  it("marks the inspector maximized and Maximize pressed once Maximize is pressed", async () => {
    render(<Inspector node={workNode} onClose={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Maximize" }));

    expect({
      pressed: screen.getByRole("button", { name: "Maximize" }).getAttribute("aria-pressed"),
      maximized: screen.getByRole("complementary", { name: "Node inspector" }).hasAttribute("data-maximized"),
    }).toEqual({ pressed: "true", maximized: true });
  });

  it("offers no tabs for the marker node done", () => {
    const doneNode = nodeView({ id: "done" });

    render(<Inspector node={doneNode} />);

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
