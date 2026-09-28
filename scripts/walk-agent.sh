#!/usr/bin/env bash
# Walks one run through a real agent pod: the floor and the cluster agent on this machine, the
# agent in minikube. Needs `npm run minikube-setup` to have run. Spends a little of whatever
# Claude credential `npm run minikube-claude-auth` put in the cluster.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
[ -f "${PROCESS_ENV_FILE}" ] || fail "${PROCESS_ENV_FILE} is missing: run 'npm run minikube-setup' first"
set -a
# shellcheck disable=SC1090
. "${PROCESS_ENV_FILE}"
set +a
export KUBECONFIG="${FLOOR_KUBECONFIG}"

PORT="${PORT:-8099}"
BASE="http://localhost:${PORT}"
TOKEN="walk-agent-service-token"
NAME="walk-agent-$(date +%s)"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
WAIT_SECONDS="${FLOOR_WALK_WAIT_SECONDS:-600}"
LOGS="$(mktemp -d)"
PIDS=()

say() { printf '\n== %s\n' "$*"; }
api() { curl -sS --fail-with-body -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' "$@"; }

stop_processes() {
  local pid
  for pid in "${PIDS[@]}"; do kill "${pid}" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap stop_processes EXIT

what_went_wrong() {
  say "the floor's log"; tail -40 "${LOGS}/api.log" || true
  say "the cluster agent's log"; tail -40 "${LOGS}/cluster-agent.log" || true
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get events --sort-by=.lastTimestamp 2>&1 | tail -15 || true
}

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting the floor on :${PORT}; pods will reach it at host.minikube.internal"
PORT="${PORT}" FLOOR_BASE_URL="http://host.minikube.internal:${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" \
  FLOOR_VISIT_TOKEN_SECRET="walk-agent-secret" FLOOR_POLL_MS=200 \
  node apps/api/dist/index.js >"${LOGS}/api.log" 2>&1 &
PIDS+=($!)

for _ in $(seq 1 50); do
  curl -sf "${BASE}/readyz" >/dev/null && break
  sleep 0.2
done
curl -sf "${BASE}/readyz" || { what_went_wrong; fail "the floor did not become ready"; }

say "starting the cluster agent"
FLOOR_API_URL="${BASE}" FLOOR_CLUSTER_AGENT_TOKEN="${TOKEN}" FLOOR_HEALTH_PORT="$((PORT - 1))" FLOOR_CLAIM_MAX_IDLE_MS=5000 \
  node apps/cluster-agent/dist/index.js >"${LOGS}/cluster-agent.log" 2>&1 &
PIDS+=($!)

say "putting an agent definition, a station and a line: write -> done"
api -X POST "${BASE}/agent-definitions" -d @- >/dev/null <<JSON
{"id": "${NAME}", "settings": {
  "model": "${MODEL}", "image": "node:22-bookworm", "timeoutMinutes": 8, "config": {"maxTurns": 10},
  "prompt": "Write exactly one short sentence about {topic} into the file {note_path}. Do nothing else. When the file is written, end your reply with this line on its own: LORE_NODE_RESULT: success"
}}
JSON
api -X POST "${BASE}/stations" -d @- >/dev/null <<JSON
{"id": "${NAME}", "kind": "agent", "agentDefinition": "${NAME}", "outcomes": ["success", "failed"],
 "needs": [{"name": "topic", "kind": "value"}],
 "produces": [{"name": "note", "kind": "file", "path": "note.md"}]}
JSON
api -X POST "${BASE}/assembly-lines" -d @- >/dev/null <<JSON
{"id": "${NAME}", "entry": "write", "exit": "done",
 "args": {"topic": {"kind": "value", "subject": true}},
 "nodes": [{"id": "write", "station": "${NAME}"}, {"id": "done"}],
 "edges": [{"from": "write", "to": "done", "on": "success"}]}
JSON

say "starting a run"
RUN="$(api -X POST "${BASE}/assembly-lines/${NAME}/start" -d '{"repo":"github.com/re-cinq/floor","startItems":{"topic":{"kind":"value","ref":"robots that bend girders","by":"walk-agent.sh"}}}' | jq -r .run.id)"
echo "run ${RUN}"

say "waiting for the agent, up to ${WAIT_SECONDS}s"
OUTCOME=null
SEEN=""
for _ in $(seq 1 "$((WAIT_SECONDS / 5))"); do
  OUTCOME="$(api "${BASE}/assembly-runs/${RUN}" | jq -r .run.outcome)"
  [ "${OUTCOME}" != "null" ] && break
  NOW="$(kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get pods --no-headers 2>/dev/null | awk '!/agent-controller/ {printf "%s  ", $3}' || true)"
  if [ "${NOW}" != "${SEEN}" ]; then echo "  pods: ${NOW:-none yet}"; SEEN="${NOW}"; fi
  sleep 5
done

say "the run"
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason, bag}'

VISIT="$(api "${BASE}/station-runs?run=${RUN}" | jq -r '.items[0].id')"
say "the visit's report"
api "${BASE}/station-runs/${VISIT}" | jq '{report, worker}'

say "what the agent cost"
api "${BASE}/station-runs/${VISIT}/records?kind=llm_call" | jq -c '.items[].body | {costUsd, turns, durationMs}'
echo "turns recorded: $(api "${BASE}/station-runs/${VISIT}/records?kind=turn&limit=200" | jq '.items | length')"

NOTE="$(api "${BASE}/assembly-runs/${RUN}" | jq -r '.bag.note.ref // empty')"
if [ -n "${NOTE}" ]; then
  say "note.md, as the agent wrote it"
  api "${BASE}/blobs/${NOTE}"
  echo
fi

say "its events, in order"
api "${BASE}/events?run=${RUN}" | jq -r '.items[] | "\(.id)\t\(.name)\t\(if .ackedAt then "acked" elif .deadAt then "dead: \(.lastError)" else "open" end)"'

if [ "${OUTCOME}" != "success" ] || [ -z "${NOTE}" ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, note ${NOTE:-missing}; logs kept in ${LOGS}"
fi

say "waiting for the cluster agent to clean up after the visit"
for _ in $(seq 1 30); do
  LEFT="$(kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,stations,agentdefinitions,pods --no-headers 2>/dev/null | awk -v visit="${VISIT}" 'index($0, visit) {print $1}' || true)"
  [ -z "${LEFT}" ] && break
  sleep 5
done
if [ -n "${LEFT}" ]; then echo "still in the cluster:"; echo "${LEFT}"; else echo "nothing of visit ${VISIT} is left in the cluster"; fi

say "walked: ${RUN} settled as success, through a real pod"
