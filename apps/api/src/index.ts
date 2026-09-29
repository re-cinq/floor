import { hostname } from "node:os";
import { createPool, migrate } from "@floor/store";
import { loadConfig } from "./config.js";
import { buildDeps } from "./deps.js";
import { buildLoop } from "./engine/loop.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);

  await migrate(pool);
  const deps = buildDeps(pool, config);
  const loop = buildLoop(deps, `${hostname()}:${process.pid}`);
  const server = await buildServer(deps, () => loop.holdsLease());

  await server.start();
  loop.start();
  console.log(`floor api listening on ${server.info.uri}`);

  const shutDown = async (): Promise<void> => {
    await loop.stop();
    await server.stop();
    await deps.notifier.close();
    await pool.end();
  };

  process.once("SIGTERM", () => void shutDown());
  process.once("SIGINT", () => void shutDown());
}

await main();
