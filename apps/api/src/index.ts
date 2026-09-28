import { createPool, migrate } from "@floor/store";
import { loadConfig } from "./config.js";
import { buildDeps } from "./deps.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);

  await migrate(pool);
  const deps = buildDeps(pool, config);
  const server = await buildServer(deps);

  await server.start();
  console.log(`floor api listening on ${server.info.uri}`);
}

await main();
