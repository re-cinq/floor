// Live create/delete over @kubernetes/client-node for the AgentDefinition + Station + Agent triple; ported from lore's KubeAgentApi. See ../../README.md.

import { GROUP, VERSION } from "@re-cinq/agent-contracts";
import type { AgentTriple } from "../domain/agent-triple.js";
import { agentsNamespace, customObjectsApi } from "./clients.js";
import { isConflict, isMissing } from "../lib/k8s-errors.js";

const AGENT_DEFINITION_PLURAL = "agentdefinitions";
const STATION_PLURAL = "stations";
const AGENT_PLURAL = "agents";

export interface AgentResourcesApi {
  /** Station first, then AgentDefinition, then Agent — nothing is ever visible pointing at a resource that does not exist yet. */
  apply(triple: AgentTriple): Promise<{ name: string; created: boolean }>;
  /** All three, in the reverse order, tolerating any of them already being gone. */
  delete(name: string): Promise<{ name: string; deleted: boolean }>;
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
    const results = await Promise.all([
      this.remove(AGENT_PLURAL, name),
      this.remove(AGENT_DEFINITION_PLURAL, name),
      this.remove(STATION_PLURAL, name),
    ]);

    return { name, deleted: results.some(Boolean) };
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
