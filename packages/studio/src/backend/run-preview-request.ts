// The request that shows what a run of one agent node would do, before it is started.
import { enforce } from "@re-cinq/floor-assembly-lines";
import { extendedPrompt } from "@re-cinq/floor-pipeline";
import type { Request } from "../protocol.js";
import type { StationBody } from "@re-cinq/floor-contracts";
import type { LineView, NodeView } from "../view.js";
import { runPreview, type RunPreview, type StationSettings } from "../run/run-preview.js";
import { nodeOf } from "./fixture-requests.js";
import type { Handler, StudioContext } from "./requests.js";
import { absentSourceBlockers } from "./sources-on-disk.js";

export type RunPreviewRequest = Extract<Request, { type: "run.preview" }>;

export const runPreviewHandler: Handler<RunPreviewRequest> = {
  type: "run.preview",
  handle: async (context, request) => (await previewFor(context, request)).preview,
};

export interface PreviewedNode {
  preview: RunPreview;
  station: StationBody;
  line: LineView;
}

export async function previewFor(context: StudioContext, { line, node, fixture, folder, permission }: Omit<RunPreviewRequest, "id" | "type">): Promise<PreviewedNode> {
  const collection = await context.readCollection();
  const found = nodeOf(collection, line, node);

  enforce(found?.kind, `line ${line} has no node ${node}`);
  const { kind, outcomes, needs, produces, agentDefinition, agent } = found;
  const station = { kind, outcomes, needs, produces, agentDefinition };
  const preview = runPreview({ station, prompt: promptOf(found).trimEnd(), settings: (agent?.settings ?? {}) as StationSettings, fixture, folder, permission });
  const absent = await absentSourceBlockers([...preview.copies, ...preview.links]);

  return { preview: { ...preview, blockers: [...preview.blockers, ...absent] }, station, line: collection.lines.find(({ id }) => id === line) as LineView };
}

function promptOf({ agent, extra }: NodeView): string {
  const base = agent?.prompt ?? "";

  return extra ? extendedPrompt(base, extra.text) : base;
}
