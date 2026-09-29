// The floor, as a station reaches it: the shared client, with the service token claiming and acking and each visit's own token doing everything about that visit.
import { createFloorClient, createVisitClient, serviceToken, visitToken, type FloorClient } from "@re-cinq/floor-client";
import type { ClaimedEvent, Report, VisitBrief } from "@re-cinq/floor-contracts";

export type { BriefNeed, VisitBrief } from "@re-cinq/floor-contracts";

export type Claimed = ClaimedEvent;

export interface FloorAccess {
  floorUrl: string;
  token: string;
}

export class Floor {
  private readonly client: FloorClient;

  constructor(private readonly access: FloorAccess) {
    this.client = createFloorClient({ url: access.floorUrl, token: serviceToken(access.token) });
  }

  async claim(tags: string[], limit: number): Promise<Claimed[]> {
    return this.client.events.claim({ tags, limit });
  }

  async ack(eventId: string): Promise<void> {
    await this.client.events.ack(eventId);
  }

  async fail(eventId: string, error: string): Promise<void> {
    await this.client.events.fail(eventId, error);
  }

  /** Null when the visit is already done, or gone: a dispatch delivered again after its visit reported. */
  async brief(visitId: string): Promise<VisitBrief | null> {
    const outcome = await this.client.stationRuns.brief(visitId);

    return outcome.kind === "brief" ? outcome.brief : null;
  }

  // The brief gives a file's address as a pod would reach it. A station reaches the floor its own way, so only the path is taken from it.
  async read(url: string, token: string): Promise<Buffer> {
    const stored = await this.visit("", token).readBlob(url);

    if (!stored) throw new Error(`the floor has no bytes at "${url}"`);

    return Buffer.from(stored.bytes);
  }

  async store(bytes: Buffer, token: string): Promise<string> {
    const stored = await this.visit("", token).storeBlob(new Uint8Array(bytes));

    return stored.hash;
  }

  async record(visitId: string, body: unknown, token: string): Promise<void> {
    await this.visit(visitId, token).append([{ kind: "llm_call", body, occurredAt: new Date() }]);
  }

  // Deduplicated on the visit, so posting it again after a lost answer reports once.
  async report(visitId: string, report: Report, worker: string): Promise<void> {
    await this.visit(visitId, this.access.token).report({ report, worker });
  }

  private visit(visitId: string, token: string) {
    return createVisitClient({ url: this.access.floorUrl, token: visitToken(token), visitId });
  }
}
