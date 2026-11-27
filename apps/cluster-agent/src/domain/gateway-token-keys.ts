// Pure: where a visit's gateway tokens go in the agents' Secret. One key per MCP server that asks for a token, named after the visit and the server, holding what the pod sends that server as its Authorization header. See ../../README.md, "Gateway tokens".

import type { McpServerSettings } from "@re-cinq/floor-contracts";

const NOT_A_KEY_CHARACTER = /[^-_a-zA-Z0-9]/g;
const NOT_A_VARIABLE_CHARACTER = /[^A-Z0-9]/g;

export interface GatewayTokenAsk {
  visitId: string;
  /** The MCP servers of the visit's settings; only those with `visitToken` get a key. */
  servers: readonly McpServerSettings[] | undefined;
  /** The brief's `serverTokens`: a signed token by server name. */
  serverTokens: Record<string, string> | undefined;
}

export interface GatewayTokenKeys {
  /** The Secret key by server name: what that server's `headers_secret` names. */
  keyOf: Record<string, string>;
  /** The Secret's entries, value by key. */
  entries: Record<string, string>;
}

/** What every gateway token key of one visit starts with, and no other key does. */
export function gatewayTokenKeyPrefix(visitId: string): string {
  return `visit-${visitId}-gateway-token.`;
}

/** A Secret data key takes letters, digits, `-`, `_` and `.` only; anything else in a server's name becomes `_`. */
export function gatewayTokenKey(visitId: string, serverName: string): string {
  return `${gatewayTokenKeyPrefix(visitId)}${serverName.replace(NOT_A_KEY_CHARACTER, "_")}`;
}

/** What a recipe pushed before any visit names for a server that asks: a key nothing writes, so a pod started from that recipe never starts, where it would otherwise call the server with no token. */
export function unissuedGatewayTokenKey(serverName: string): string {
  return `no-visit-gateway-token.${serverName.replace(NOT_A_KEY_CHARACTER, "_")}`;
}

/** The subsystem sends an MCP server's `headers_secret` as the value of the Authorization header, so the key holds the value alone, not a `Name: value` line. */
export function bearerValue(token: string): string {
  return `Bearer ${token}`;
}

/** Throws for a server that asks for a token the brief does not carry, and for two servers whose tokens would share one key or one pod variable. */
export function gatewayTokenKeys(ask: GatewayTokenAsk): GatewayTokenKeys {
  const asking = (ask.servers ?? []).filter((server) => server.visitToken);
  const keyOf: Record<string, string> = {};
  const entries: Record<string, string> = {};
  const takenBy = new Map<string, string>();

  for (const { name } of asking) {
    const key = gatewayTokenKey(ask.visitId, name);
    const other = takenBy.get(podVariableOf(key));

    if (other !== undefined) throw new Error(`MCP servers "${other}" and "${name}" both ask for a gateway token, and their names are too alike to keep the two tokens apart: rename one`);
    takenBy.set(podVariableOf(key), name);
    keyOf[name] = key;
    entries[key] = bearerValue(tokenFor(name, ask));
  }

  return { keyOf, entries };
}

function tokenFor(name: string, ask: GatewayTokenAsk): string {
  const token = ask.serverTokens?.[name];

  if (!token) throw new Error(`MCP server "${name}" asks for a gateway token, and the brief of station run "${ask.visitId}" carries none for it, so no pod is started`);

  return token;
}

// The subsystem hands the pod a key's value in a variable named after the key, upper-cased with every other character as `_`: two keys that fold to one variable would give one server the other's token.
function podVariableOf(key: string): string {
  return key.toUpperCase().replace(NOT_A_VARIABLE_CHARACTER, "_");
}
