// The same seven calls over assembly lines, stations, agent definitions and schedules — one generic, as the floor itself registers one route table three times.
import type { DefinitionRowView, PutResult } from "@re-cinq/floor-contracts";
import { asked, done, type Reachable } from "./send.js";

const HTTP_NOT_FOUND = 404;

export interface DefinitionApi<Body> {
  list(name?: string): Promise<DefinitionRowView<Body>[]>;
  /** Null when nothing of that id is there, or it was archived. */
  get(id: string): Promise<DefinitionRowView<Body> | null>;
  versions(id: string): Promise<DefinitionRowView<Body>[]>;
  version(id: string, hash: string): Promise<DefinitionRowView<Body> | null>;
  /** A version is its content: putting the same body twice answers the same hash, created false the second time. */
  put(id: string, body: Body): Promise<PutResult>;
  archive(id: string): Promise<void>;
}

export function definitionApi<Body>(floor: Reachable, base: string): DefinitionApi<Body> {
  const rows = async (path: string, query?: Record<string, string | undefined>): Promise<DefinitionRowView<Body>[]> => {
    const page = await asked<{ items: DefinitionRowView<Body>[] }>(floor, { method: "GET", path, query });

    return page?.items ?? [];
  };

  return {
    list: (name) => rows(`/${base}`, { name }),
    get: (id) => asked<DefinitionRowView<Body>>(floor, { method: "GET", path: `/${base}/${id}` }, [HTTP_NOT_FOUND]),
    versions: (id) => rows(`/${base}/${id}/versions`),
    version: (id, hash) => asked<DefinitionRowView<Body>>(floor, { method: "GET", path: `/${base}/${id}/versions/${hash}` }, [HTTP_NOT_FOUND]),
    put: async (id, body) => (await asked<PutResult>(floor, { method: "PUT", path: `/${base}/${id}`, body }))!,
    archive: async (id) => {
      await done(floor, { method: "DELETE", path: `/${base}/${id}` });
    },
  };
}
