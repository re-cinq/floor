// Pure: whether the clusters hold an agent definition's latest version, from what each cluster last reported reading out of its own kube.

/** all: every live cluster holds the latest version. some: a live cluster holds a version, but not every one holds the latest. none: no live cluster holds any. */
export type PresenceState = "all" | "some" | "none";

export interface ClusterSeen {
  id: string;
  lastSeenAt: Date;
}

export interface ClusterHolding {
  clusterId: string;
  hash: string;
}

export interface ClusterPresence {
  id: string;
  hash: string | null;
  current: boolean;
}

export interface AgentPresence {
  state: PresenceState;
  latest: string;
  clusters: ClusterPresence[];
}

export interface PresenceInput {
  latest: string;
  clusters: ClusterSeen[];
  holdings: ClusterHolding[];
  now: Date;
}

const MS_PER_MINUTE = 60_000;
/** A cluster-agent registers again at least every minute; one silent this long is gone, and its old version must not hold the dot at yellow forever. */
export const CLUSTER_LIVE_MINUTES = 5;

export function presenceState(input: PresenceInput): AgentPresence {
  const liveSince = input.now.getTime() - CLUSTER_LIVE_MINUTES * MS_PER_MINUTE;
  const held = new Map(input.holdings.map((holding) => [holding.clusterId, holding.hash]));
  const { clusters: seen } = input;
  const clusters = seen
    .filter((cluster) => cluster.lastSeenAt.getTime() >= liveSince)
    .map((cluster) => {
      const hash = held.get(cluster.id) ?? null;

      return { id: cluster.id, hash, current: hash === input.latest };
    });

  return { state: stateOf(clusters), latest: input.latest, clusters };
}

function stateOf(clusters: ClusterPresence[]): PresenceState {
  if (clusters.length > 0 && clusters.every((cluster) => cluster.current)) return "all";
  if (clusters.some((cluster) => cluster.hash !== null)) return "some";

  return "none";
}
