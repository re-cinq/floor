// Live create/delete over @kubernetes/client-node for a visit's Agent and the recipe (AgentDefinition + Station) it runs; ported from lore's KubeAgentApi. See ../../README.md.

import { GROUP, VERSION } from "@re-cinq/agent-contracts";
import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import type { AgentDefinitionBody } from "@re-cinq/floor-contracts";
import type { AgentTriple, Recipe } from "../domain/agent-triple.js";
import { BODY_ANNOTATION, DEFINITION_LABEL, HASH_ANNOTATION, VARIANT_ANNOTATION, type HeldRecipe } from "../domain/pushed-recipe.js";
import { agentsNamespace, customObjectsApi } from "./clients.js";
import { isConflict, isMissing } from "../lib/k8s-errors.js";
import { abandonedAgents, unusedRecipes, type Listed, type Unused } from "../domain/recipe-sweep.js";

const AGENT_DEFINITION_PLURAL = "agentdefinitions";
const STATION_PLURAL = "stations";
const AGENT_PLURAL = "agents";

export interface AgentResourcesApi {
  /** Station first, then AgentDefinition, then Agent — nothing is ever visible pointing at a resource that does not exist yet. A recipe already there is the one this visit runs. */
  apply(triple: AgentTriple): Promise<{ name: string; created: boolean }>;
  /** The visit's Agent only, tolerating it already being gone: its recipe may run other visits. */
  delete(name: string): Promise<{ name: string; deleted: boolean }>;
  /** Removes the finished visit Agents whose abort was lost, then the floor's recipes no Agent runs any more; never run beside a dispatch, which could be about to use one. */
  sweep(now: Date): Promise<Unused>;
  /** A recipe pushed before any visit: created, or, when a visit already made it, given the marks that say which agent definition it holds. */
  applyRecipe(recipe: Recipe): Promise<void>;
  /** Every pushed recipe of one agent definition, as kube holds it now, edits included. */
  heldRecipes(definitionId: string): Promise<HeldRecipe[]>;
}

export class KubeAgentResourcesApi implements AgentResourcesApi {
  constructor(
    private readonly customObjects = customObjectsApi,
    private readonly namespace: string = agentsNamespace(),
  ) {}

  async apply(triple: AgentTriple): Promise<{ name: string; created: boolean }> {
    const agent = triple.agent;
    const name = agent.metadata?.name ?? "";

    await this.create(STATION_PLURAL, "Station", triple.station);
    await this.create(AGENT_DEFINITION_PLURAL, "AgentDefinition", triple.agentDefinition);

    return this.create(AGENT_PLURAL, "Agent", agent, name);
  }

  async delete(name: string): Promise<{ name: string; deleted: boolean }> {
    return { name, deleted: await this.remove(AGENT_PLURAL, name) };
  }

  async applyRecipe(recipe: Recipe): Promise<void> {
    await this.createOrMark(STATION_PLURAL, "Station", recipe.station);
    await this.createOrMark(AGENT_DEFINITION_PLURAL, "AgentDefinition", recipe.agentDefinition);
  }

  async heldRecipes(definitionId: string): Promise<HeldRecipe[]> {
    const labelSelector = `${DEFINITION_LABEL}=${definitionId}`;
    const [stations, definitions] = await Promise.all([this.list(STATION_PLURAL, labelSelector), this.list(AGENT_DEFINITION_PLURAL, labelSelector)]);
    const byName = new Map(definitions.map((definition) => [nameOf(definition), definition]));

    return stations.flatMap((station) => {
      const definition = byName.get(station.spec?.agentDefRef ?? "");

      return definition ? [heldRecipe(station, definition)] : [];
    });
  }

  async sweep(now: Date): Promise<Unused> {
    const [agents, stations, definitions] = await Promise.all([
      this.list(AGENT_PLURAL),
      this.list(STATION_PLURAL),
      this.list(AGENT_DEFINITION_PLURAL),
    ]);
    const abandoned = await this.removeAbandoned(agents, now);
    const unused = unusedRecipes({
      agentStationRefs: agents.filter((agent) => !abandoned.has(nameOf(agent))).map((agent) => agent.spec?.stationRef ?? ""),
      stations: stations.map((station) => ({ ...listed(station), ref: station.spec?.agentDefRef })),
      definitions: definitions.map(listed),
      now,
    });

    await Promise.all(unused.stations.map((name) => this.remove(STATION_PLURAL, name)));
    await Promise.all(unused.definitions.map((name) => this.remove(AGENT_DEFINITION_PLURAL, name)));

    return { agents: [...abandoned], ...unused };
  }

  private async removeAbandoned(agents: ListedObject[], now: Date): Promise<Set<string>> {
    const listedAgents = agents.map((agent) => ({ name: nameOf(agent), phase: agent.status?.phase, createdAt: agent.metadata?.creationTimestamp ?? "" }));
    const abandoned = abandonedAgents(listedAgents, now);

    await Promise.all(abandoned.map((name) => this.remove(AGENT_PLURAL, name)));

    return new Set(abandoned);
  }

  private async list(plural: string, labelSelector?: string): Promise<ListedObject[]> {
    const response = (await this.customObjects().listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural,
      labelSelector,
    })) as { items?: ListedObject[] };

    return response.items ?? [];
  }

  private async create(
    plural: string,
    kind: string,
    body: { metadata?: { name?: string } },
    reportAs?: string,
  ): Promise<{ name: string; created: boolean }> {
    const name = reportAs ?? body.metadata?.name ?? "";

    try {
      await this.customObjects().createNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.namespace,
        plural,
        body: { apiVersion: `${GROUP}/${VERSION}`, kind, ...body },
      });

      return { name, created: true };
    } catch (err) {
      // A 409 means a redelivered dispatch, so the caller hears "nothing created" rather than an error it would have to classify.
      if (isConflict(err)) return { name, created: false };
      throw err;
    }
  }

  private async createOrMark(plural: string, kind: string, body: { metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> } }): Promise<void> {
    const { created } = await this.create(plural, kind, body);

    if (created) return;
    const metadata = body.metadata ?? {};

    await this.customObjects().patchNamespacedCustomObject(
      { group: GROUP, version: VERSION, namespace: this.namespace, plural, name: metadata.name ?? "", body: { metadata: { labels: metadata.labels, annotations: metadata.annotations } } },
      setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
    );
  }

  private async remove(plural: string, name: string): Promise<boolean> {
    try {
      await this.customObjects().deleteNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.namespace,
        plural,
        name,
      });

      return true;
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  }
}

interface ListedObject {
  metadata?: { name?: string; creationTimestamp?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  spec?: {
    stationRef?: string;
    agentDefRef?: string;
    model?: string;
    prompt?: string;
    deadlineMinutes?: number;
    template?: { spec?: { containers?: { name?: string; image?: string }[] } };
  };
  status?: { phase?: string };
}

// What the recipe's two resources say now, beside the version and body it was pushed with: a person's edit shows as a difference between them.
function heldRecipe(station: ListedObject, definition: ListedObject): HeldRecipe {
  return { ...pushMarks(definition.metadata), spec: { ...definitionFields(definition.spec), ...stationFields(station.spec) } };
}

function pushMarks(metadata: ListedObject["metadata"] = {}): Omit<HeldRecipe, "spec"> {
  const { annotations = {}, creationTimestamp = "" } = metadata;

  return { ...annotated(annotations), createdAt: creationTimestamp };
}

function annotated(annotations: Record<string, string>): Pick<HeldRecipe, "hash" | "variant" | "body"> {
  const { [HASH_ANNOTATION]: hash = "", [VARIANT_ANNOTATION]: variant = "", [BODY_ANNOTATION]: body = "null" } = annotations;

  return { hash, variant: variant || null, body: JSON.parse(body) as AgentDefinitionBody };
}

function definitionFields(spec: ListedObject["spec"] = {}): HeldRecipe["spec"] {
  return { model: spec.model, prompt: spec.prompt };
}

function stationFields(spec: ListedObject["spec"] = {}): HeldRecipe["spec"] {
  const { template } = spec;
  const containers = template?.spec?.containers ?? [];

  return { image: containers.find((candidate) => candidate.name === "agent")?.image, timeoutMinutes: spec.deadlineMinutes };
}

function nameOf(object: ListedObject): string {
  return object.metadata?.name ?? "";
}

function listed(object: ListedObject): Listed {
  const metadata = object.metadata ?? {};

  return { name: metadata.name ?? "", createdAt: metadata.creationTimestamp ?? "", labels: metadata.labels, annotations: metadata.annotations };
}
