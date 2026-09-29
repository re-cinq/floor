// Watches one run as it happens, in a terminal, over the floor's live channel (docs/api_sketch.md, "Live"): what lore's relay is sent, a line a frame. Ends with 0 when the run settled.
import { WebSocket } from "ws";

const SETTLED = 1000;
const USAGE_ERROR = 2;
const SEQ_WIDTH = 5;
const [floor, runId, after = "0"] = process.argv.slice(USAGE_ERROR);
const token = process.env.FLOOR_SERVICE_TOKEN;

function watch() {
  const socket = new WebSocket(liveUrl(), { headers: { authorization: `Bearer ${token}` } });

  socket.on("message", (said) => console.log(lineOf(JSON.parse(said.toString()))));
  socket.on("error", (error) => console.error(`could not watch: ${error.message}`));
  socket.on("close", (code, reason) => {
    console.log(`closed ${code} ${reason.toString()}`);
    process.exitCode = code === SETTLED ? 0 : 1;
  });
}

function liveUrl() {
  const url = new URL(`/assembly-runs/${runId}/live?after=${after}`, floor);

  url.protocol = url.protocol.replace("http", "ws");

  return url;
}

function lineOf(frame) {
  const seq = String(frame.seq ?? "").padStart(SEQ_WIDTH);

  return `${seq}  ${frame.type}  ${toldBy(frame)}`.trimEnd();
}

function toldBy(frame) {
  if (frame.type === "record") return `${frame.nodeId}#${frame.iteration} ${frame.record.kind} ${frame.record.seq}`;
  if (frame.visit) return aboutVisit(frame.visit);

  return frame.run?.outcome ?? "";
}

function aboutVisit(visit) {
  return `${visit.nodeId}#${visit.iteration} ${visit.report?.outcome ?? ""}`.trimEnd();
}

if (floor && runId && token) watch();

if (!floor || !runId || !token) {
  console.error("usage: FLOOR_SERVICE_TOKEN=<token> node scripts/watch-run.mjs <floor url> <run id> [after]");
  process.exitCode = USAGE_ERROR;
}
