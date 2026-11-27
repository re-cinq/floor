#!/usr/bin/env node
// floor-studio: opens a page that draws a collection of assembly lines, over a backend that reads the folder.
import { fileURLToPath } from "node:url";
import { openOnDesktop } from "./shell/open-browser.js";
import { studioCommand } from "./shell/studio-command.js";

const PAGE_WAIT_MS = 3000;
const PAGE_DIR = fileURLToPath(new URL("./web", import.meta.url));

const outcome = await studioCommand(process.argv.slice(2), { out: console.log, err: console.error, pageDir: PAGE_DIR, openBrowser: openOnDesktop, pageWaitMs: PAGE_WAIT_MS });

if ("exitCode" in outcome) process.exit(outcome.exitCode);
const { running } = outcome;
const stop = () => void running.close().then(() => process.exit(0));

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
