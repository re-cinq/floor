// Live create/delete over @kubernetes/client-node for a visit's Agent and the recipe (AgentDefinition + Station) it runs; ported from lore's KubeAgentApi. See ../../README.md.

import { GROUP, VERSION } from "@re-cinq/agent-contracts";
import type { AgentTriple } from "../domain/agent-triple.js";
import { agentsNamespace, customObjectsApi } from "./clients.js";
import { isConflict, isMissing } from "../lib/k8s-errors.js";
import { unusedRecipes, type Listed, type Unused } from "../domain/recipe-sweep.js";

const AGENT_DEFINITION_PLURAL = "agentdefinitions";
const STATION_PLURAL = "stations";
const AGENT_PLURAL = "agents";

export interface AgentResourcesApi {
  /** Station first, then AgentDefinition, then Agent — nothing is ever visible pointing at a resource that does not exist yet. A recipe already there is the one this visit runs. */
  apply(triple: AgentTriple): Promise<{ name: string; created: boolean }>;
  /** The visit's Agent only, tolerating it already being gone: its recipe may run other visits. */
  delete(name: string): Promise<{ name: string; deleted: boolean }>;
  /** Removes the floor's recipes no Agent runs any more; never run beside a dispatch, which could be about to use one. */
  sweep(now: Date): Promise<Unused>;
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

  async sweep(now: Date): Promise<Unused> {
    const [agents, stations, definitions] = await Promise.all([
      this.list(AGENT_PLURAL),
      this.list(STATION_PLURAL),
      this.list(AGENT_DEFINITION_PLURAL),
    ]);
    const unused = unusedRecipes({
      agentStationRefs: agents.map((agent) => agent.spec?.stationRef ?? ""),
      stations: stations.map((station) => ({ ...listed(station), ref: station.spec?.agentDefRef })),
      definitions: definitions.map(listed),
      now,
    });

    await Promise.all(unused.stations.map((name) => this.remove(STATION_PLURAL, name)));
    await Promise.all(unused.definitions.map((name) => this.remove(AGENT_DEFINITION_PLURAL, name)));

    return unused;
  }

  private async list(plural: string): Promise<ListedObject[]> {
    const response = (await this.customObjects().listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural,
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
  metadata?: { name?: string; creationTimestamp?: string; labels?: Record<string, string> };
  spec?: { stationRef?: string; agentDefRef?: string };
}

function listed(object: ListedObject): Listed {
  const metadata = object.metadata ?? {};

  return { name: metadata.name ?? "", createdAt: metadata.creationTimestamp ?? "", labels: metadata.labels };
}
