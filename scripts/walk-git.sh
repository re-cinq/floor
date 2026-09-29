#!/usr/bin/env bash
# Walks one run whose station writes to a repository, through a real agent pod: git in the pod asks
# the floor for a credential, and the floor asks its provider. The provider here is a stand-in and
# the repository is public, so no real credential is involved and nothing is pushed. Needs
# `npm run minikube-setup` to have run.
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
PROVIDER_PORT="$((PORT + 2))"
BASE="http://localhost:${PORT}"
TOKEN="walk-git-service-token"
GIT_CREDENTIAL_TOKEN="walk-git-provider-token"
NAME="walk-git-$(date +%s)"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
REPOSITORY="${FLOOR_WALK_REPOSITORY:-github.com/octocat/Spoon-Knife}"
BRANCH="${FLOOR_WALK_BRANCH:-main}"
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
  say "the provider's log"; tail -20 "${LOGS}/provider.log" || true
  say "the cluster agent's log"; tail -40 "${LOGS}/cluster-agent.log" || true
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get events --sort-by=.lastTimestamp 2>&1 | tail -15 || true
}

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting the stand-in git credential provider on :${PROVIDER_PORT}"
PORT="${PROVIDER_PORT}" FLOOR_GIT_CREDENTIAL_TOKEN="${GIT_CREDENTIAL_TOKEN}" node scripts/stations/git-credentials.mjs >"${LOGS}/provider.log" 2>&1 &
PIDS+=($!)

say "starting the floor on :${PORT}; pods will reach it at host.minikube.internal"
PORT="${PORT}" FLOOR_BASE_URL="http://host.minikube.internal:${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" \
  FLOOR_VISIT_TOKEN_SECRET="walk-git-secret" FLOOR_POLL_MS=200 \
  FLOOR_GIT_CREDENTIAL_URL="http://localhost:${PROVIDER_PORT}/git-credentials" \
  FLOOR_GIT_CREDENTIAL_TOKEN="${GIT_CREDENTIAL_TOKEN}" \
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

say "putting an agent definition, a station that writes to its repository, and a line: look -> done"
api -X POST "${BASE}/agent-definitions" -d @- >/dev/null <<JSON
{"id": "${NAME}", "settings": {
  "model": "${MODEL}", "image": "node:22-bookworm", "timeoutMinutes": 8, "config": {"max_turns": 10},
  "prompt": "A git repository is cloned at {workspace_path}. Run: git -C {workspace_path} log -1 --format=%s  and write its output, and nothing else, into the file {note_path}. Do not push, fetch or pull. When the file is written, end your reply with this line on its own: LORE_NODE_RESULT: success"
}}
JSON
api -X POST "${BASE}/stations" -d @- >/dev/null <<JSON
{"id": "${NAME}", "kind": "agent", "agentDefinition": "${NAME}", "outcomes": ["success", "failed"],
 "needs": [{"name": "workspace", "kind": "git", "path": "repo", "access": "write"}],
 "produces": [{"name": "note", "kind": "file", "path": "note.md"}]}
JSON
api -X POST "${BASE}/assembly-lines" -d @- >/dev/null <<JSON
{"id": "${NAME}", "entry": "look", "exit": "done",
 "args": {"workspace": {"kind": "git"}},
 "nodes": [{"id": "look", "station": "${NAME}"}, {"id": "done"}],
 "edges": [{"from": "look", "to": "done", "on": "success"}]}
JSON

say "starting a run on ${REPOSITORY}@${BRANCH}"
RUN="$(api -X POST "${BASE}/assembly-lines/${NAME}/start" -d "{\"repo\":\"${REPOSITORY}\",\"startItems\":{\"workspace\":{\"kind\":\"git\",\"ref\":\"${REPOSITORY}@${BRANCH}\",\"by\":\"walk-git.sh\"}}}" | jq -r .run.id)"
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
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason}'

VISIT="$(api "${BASE}/station-runs?run=${RUN}" | jq -r '.items[0].id')"
say "the visit's report"
api "${BASE}/station-runs/${VISIT}" | jq '{report, worker}'

say "what the provider was asked, by the floor, for the pod"
cat "${LOGS}/provider.log"
ASKED="$(grep -c "asked for write on https://${REPOSITORY}" "${LOGS}/provider.log" || true)"

NOTE="$(api "${BASE}/assembly-runs/${RUN}" | jq -r '.bag.note.ref // empty')"
if [ -n "${NOTE}" ]; then
  say "the last commit on ${BRANCH}, as the agent read it from its clone"
  api "${BASE}/blobs/${NOTE}"
  echo
fi

if [ "${OUTCOME}" != "success" ] || [ -z "${NOTE}" ] || [ "${ASKED}" -eq 0 ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, note ${NOTE:-missing}, provider asked ${ASKED} time(s); logs kept in ${LOGS}"
fi

say "waiting for the cluster agent to clean up after the walk"
wait_for_cleanup

say "walked: ${RUN} settled as success; git in the pod asked the floor ${ASKED} time(s)"
