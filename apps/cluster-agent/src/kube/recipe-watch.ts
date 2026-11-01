// Watches the pushed recipes in kube, so a recipe a person edited by hand reaches the floor within seconds and becomes the agent definition's newest version there. A dropped watch is opened again, which relists.

import { Watch } from "@kubernetes/client-node";
import { GROUP, VERSION } from "@re-cinq/agent-contracts";
import { DEFINITION_LABEL } from "../domain/pushed-recipe.js";
import { agentsNamespace, kubeConfig } from "./clients.js";

/** Several changes to one recipe, its Station and its AgentDefinition, come as a burst; one report covers them all. */
const SETTLE_MS = 2_000;
const REOPEN_MS = 5_000;
const PLURALS = ["agentdefinitions", "stations"];

export interface RecipeWatchDeps {
  /** Tells the floor what kube holds of one agent definition now. */
  report: (definitionId: string) => Promise<void>;
  onError: (error: unknown) => void;
  running: () => boolean;
  namespace?: string;
}

export function watchRecipes(deps: RecipeWatchDeps): void {
  const pending = new Map<string, NodeJS.Timeout>();

  const changed = (definitionId: string) => {
    clearTimeout(pending.get(definitionId));
    pending.set(
      definitionId,
      setTimeout(() => {
        pending.delete(definitionId);
        deps.report(definitionId).catch(deps.onError);
      }, SETTLE_MS),
    );
  };

  for (const plural of PLURALS) {
    open(deps, `/apis/${GROUP}/${VERSION}/namespaces/${deps.namespace ?? agentsNamespace()}/${plural}`, changed);
  }
}

function open(deps: RecipeWatchDeps, path: string, changed: (definitionId: string) => void): void {
  if (!deps.running()) return;

  const reopen = (error: unknown) => {
    if (error) deps.onError(error);
    setTimeout(() => open(deps, path, changed), REOPEN_MS);
  };

  new Watch(kubeConfig())
    .watch(
      path,
      { labelSelector: DEFINITION_LABEL },
      (phase, object: { metadata?: { labels?: Record<string, string> } }) => {
        const labels = object.metadata?.labels;
        const definitionId = labels?.[DEFINITION_LABEL];

        if (definitionId && phase !== "DELETED") changed(definitionId);
      },
      reopen,
    )
    .catch(reopen);
}
