// Start a Hello World run and print its greeting so you can verify the worker’s result.
import { createFloorClient, serviceToken } from "@re-cinq/floor-client";
import { startGreeting } from "./start.mts";
import { watchOutcome } from "./watch-run.mts";

const url = process.env.FLOOR_API_URL;
const token = process.env.FLOOR_SERVICE_TOKEN;
if (!url || !token) throw new Error("Set FLOOR_API_URL and FLOOR_SERVICE_TOKEN");

const access = { url, token: serviceToken(token) };
const { id } = await startGreeting(access, "Ada");
const outcome = await watchOutcome(access, id);
if (outcome !== "success") throw new Error(`Run ${id} settled with outcome ${outcome}`);

// The greeting is in the settled run's bag, under the name declared by the pipeline.
const result = await createFloorClient(access).runs.get(id);
const greeting = result?.bag.greeting;
if (greeting?.kind !== "value") throw new Error(`Run ${id} has no greeting value`);
console.log(greeting.ref);
