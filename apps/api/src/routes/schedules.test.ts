import { describe, expect, it } from "vitest";
import { mintVisitToken } from "../visit-token.js";
import { VISIT_TOKEN_SECRET, authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

const SCHEDULE_BODY = { id: "nightly", cron: "0 0 * * *", payload: { greeting: "hi" } };
const NEXT_OCCURRENCE = new Date("2026-01-02T00:00:00.000Z");

interface PendingEvent {
  id: string;
  availableAt: Date;
}

interface ScheduleRow {
  id: string;
  body: { cron: string };
  pending: PendingEvent | null;
}

async function putSchedule(): Promise<void> {
  await injectJson(server(), { method: "POST", url: "/schedules", headers: authHeaders(), payload: SCHEDULE_BODY });
}

function pendingOf(response: { result: ScheduleRow }): PendingEvent | null {
  const { result } = response;

  return result.pending;
}

describe("POST /schedules", () => {
  it("creates a schedule with a pending event at its first occurrence", async () => {
    await putSchedule();

    const response = await injectJson<ScheduleRow>(server(), { method: "GET", url: "/schedules/nightly", headers: authHeaders() });

    expect(pendingOf(response)?.availableAt).toEqual(NEXT_OCCURRENCE);
  });

  it("returns 400 naming the field for an invalid cron expression", async () => {
    const response = await injectJson<{ errors?: string[] }>(server(), {
      method: "POST",
      url: "/schedules",
      headers: authHeaders(),
      payload: { ...SCHEDULE_BODY, cron: "not a cron" },
    });

    expect({ statusCode: response.statusCode, errors: response.result.errors }).toEqual({
      statusCode: 400,
      errors: ["cron: invalid cron expression"],
    });
  });

  it("refuses a non-service bearer token", async () => {
    const token = mintVisitToken("visit-1", new Date("2026-01-01T01:00:00Z"), VISIT_TOKEN_SECRET);

    const response = await injectJson(server(), {
      method: "POST",
      url: "/schedules",
      headers: { authorization: `Bearer ${token}` },
      payload: SCHEDULE_BODY,
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("GET /schedules/:id", () => {
  it("returns 404 for a schedule never put", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/schedules/missing", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});

describe("PUT /schedules/:id", () => {
  it("replaces the pending event", async () => {
    await putSchedule();
    const before = await injectJson<ScheduleRow>(server(), { method: "GET", url: "/schedules/nightly", headers: authHeaders() });

    await injectJson(server(), {
      method: "PUT",
      url: "/schedules/nightly",
      headers: authHeaders(),
      payload: { cron: "0 6 * * *", payload: { greeting: "hi" } },
    });
    const after = await injectJson<ScheduleRow>(server(), { method: "GET", url: "/schedules/nightly", headers: authHeaders() });

    expect(pendingOf(after)?.id).not.toBe(pendingOf(before)?.id);
  });
});

describe("DELETE /schedules/:id", () => {
  it("leaves the schedule no longer found", async () => {
    await putSchedule();

    await injectJson(server(), { method: "DELETE", url: "/schedules/nightly", headers: authHeaders() });
    const response = await injectJson(server(), { method: "GET", url: "/schedules/nightly", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /schedules/:id/trigger", () => {
  it("enqueues an extra event, distinct from the pending one", async () => {
    await putSchedule();
    const before = await injectJson<ScheduleRow>(server(), { method: "GET", url: "/schedules/nightly", headers: authHeaders() });

    const response = await injectJson<PendingEvent>(server(), { method: "POST", url: "/schedules/nightly/trigger", headers: authHeaders() });

    expect(response.result.id).not.toBe(pendingOf(before)?.id);
  });

  it("returns 404 for a schedule never put", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/schedules/missing/trigger", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});
