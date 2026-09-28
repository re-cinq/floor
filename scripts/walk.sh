#!/usr/bin/env bash
# Boots the floor against the dev Postgres and walks one run end to end over HTTP, playing the worker by hand.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-8099}"
BASE="http://localhost:${PORT}"
TOKEN="walk-service-token"
LINE="walk-$(date +%s)"
LOG="$(mktemp)"

say() { printf '\n== %s\n' "$*"; }
api() { curl -sS --fail-with-body -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' "$@"; }

npm run db:up >/dev/null
npm run build >/dev/null

PORT="${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" FLOOR_VISIT_TOKEN_SECRET="walk-secret" FLOOR_POLL_MS=100 \
  node apps/api/dist/index.js >"${LOG}" 2>&1 &
SERVER=$!
trap 'kill "${SERVER}" 2>/dev/null || true; wait "${SERVER}" 2>/dev/null || true' EXIT

say "waiting for the floor to hold its lease"
for _ in $(seq 1 50); do
  curl -sf "${BASE}/readyz" >/dev/null && break
  kill -0 "${SERVER}" 2>/dev/null || { cat "${LOG}"; exit 1; }
  sleep 0.2
done
curl -sf "${BASE}/readyz"

say "putting a service station and a line: work -> done"
api -X POST "${BASE}/stations" -d '{"id":"walk-work","kind":"service","outcomes":["success","failed"],"needs":[{"name":"ticket","kind":"value"}],"produces":[{"name":"answer","kind":"value"}]}'
api -X POST "${BASE}/assembly-lines" -d "{\"id\":\"${LINE}\",\"entry\":\"work\",\"exit\":\"done\",\"args\":{\"ticket\":{\"kind\":\"value\",\"subject\":true}},\"nodes\":[{\"id\":\"work\",\"station\":\"walk-work\"},{\"id\":\"done\"}],\"edges\":[{\"from\":\"work\",\"to\":\"done\",\"on\":\"success\"}]}"

say "starting a run"
RUN="$(api -X POST "${BASE}/assembly-lines/${LINE}/start" -d '{"repo":"github.com/re-cinq/floor","startItems":{"ticket":{"kind":"value","ref":"FLOOR-1","by":"walk.sh"}}}' | jq -r .run.id)"
echo "run ${RUN}"

say "claiming the dispatch, as the worker offering station:walk-work"
CLAIMED='[]'
for _ in $(seq 1 50); do
  CLAIMED="$(api -X POST "${BASE}/events/claim" -d '{"tags":["station:walk-work"],"limit":1}')"
  [ -n "${CLAIMED}" ] && [ "${CLAIMED}" != "[]" ] && break
  sleep 0.2
done
EVENT="$(jq -r '.[0].id' <<<"${CLAIMED}")"
VISIT="$(jq -r '.[0].payload.visitId' <<<"${CLAIMED}")"
echo "event ${EVENT}, visit ${VISIT}"

say "the brief the floor froze for that visit"
api "${BASE}/station-runs/${VISIT}" | jq '{nodeId, iteration, brief, deadline}'

say "reporting success, and acking the dispatch"
api -X POST "${BASE}/events" -d "{\"name\":\"station_run.reported\",\"payload\":{\"visitId\":\"${VISIT}\",\"worker\":\"walk.sh\",\"report\":{\"outcome\":\"success\",\"produced\":{\"answer\":\"42\"}}}}" >/dev/null
api -X POST "${BASE}/events/${EVENT}/ack"

say "waiting for the run to settle"
OUTCOME=null
for _ in $(seq 1 50); do
  OUTCOME="$(api "${BASE}/assembly-runs/${RUN}" | jq -r .run.outcome)"
  [ "${OUTCOME}" != "null" ] && break
  sleep 0.2
done

api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, bag}'

say "claiming the abort: the visit is done, and the floor tells its worker to let go"
RELEASED="$(api -X POST "${BASE}/events/claim" -d '{"tags":["station:walk-work"],"limit":1}')"
jq -r '.[0] | "\(.name) for visit \(.payload.visitId)"' <<<"${RELEASED}"
api -X POST "${BASE}/events/$(jq -r '.[0].id' <<<"${RELEASED}")/ack"
say "its events, in order"
api "${BASE}/events?run=${RUN}" | jq -r '.items[] | "\(.id)\t\(.name)\t\(if .ackedAt then "acked" elif .deadAt then "dead" else "open" end)"'

[ "${OUTCOME}" = "success" ] || { say "FAILED: outcome ${OUTCOME}"; cat "${LOG}"; exit 1; }
say "walked: ${RUN} settled as success"
