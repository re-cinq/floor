// The request that shows what a run of one agent node would do, before it is started.
import { enforce } from "@re-cinq/floor-assembly-lines";
import { extendedPrompt } from "@re-cinq/floor-pipeline";
import type { Request } from "../protocol.js";
import type { NodeView } from "../view.js";
import { runPreview, type RunPreview, type StationSettings } from "../run/run-preview.js";
import { nodeOf } from "./fixture-requests.js";
import type { Handler, StudioContext } from "./requests.js";
import { absentSourceBlockers } from "./sources-on-disk.js";

export type RunPreviewRequest = Extract<Request, { type: "run.preview" }>;

export const runPreviewHandler: Handler<RunPreviewRequest> = {
  type: "run.preview",
  handle: previewFor,
};

export async function previewFor(context: StudioContext, { line, node, fixture, folder, permission }: Omit<RunPreviewRequest, "id" | "type">): Promise<RunPreview> {
  const found = nodeOf(await context.readCollection(), line, node);

  enforce(found?.kind, `line ${line} has no node ${node}`);
  const { kind, outcomes, needs, produces, agentDefinition, agent } = found;

  const preview = runPreview({ station: { kind, outcomes, needs, produces, agentDefinition }, prompt: promptOf(found).trimEnd(), settings: (agent?.settings ?? {}) as StationSettings, fixture, folder, permission });
  const absent = await absentSourceBlockers([...preview.copies, ...preview.links]);

  return { ...preview, blockers: [...preview.blockers, ...absent] };
}

function promptOf({ agent, extra }: NodeView): string {
  const base = agent?.prompt ?? "";

  return extra ? extendedPrompt(base, extra.text) : base;
}
