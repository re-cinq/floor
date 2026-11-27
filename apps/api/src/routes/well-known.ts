// The floor's public keys (docs/api_sketch.md, "Gateway tokens"): unauthenticated, since whoever verifies a gateway token holds no floor token. Public parts only; a floor with no keys answers an empty set.
import type { Server } from "@hapi/hapi";
import type { GatewayKeys } from "../gateway-keys.js";

const CACHE_CONTROL = "public, max-age=300";

export function registerWellKnownRoutes(server: Server, keys: GatewayKeys): void {
  server.route({
    method: "GET",
    path: "/.well-known/jwks.json",
    options: { auth: false },
    handler: (request, toolkit) => toolkit.response({ keys: keys.published }).header("cache-control", CACHE_CONTROL),
  });
}
