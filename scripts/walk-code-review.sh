#!/usr/bin/env bash
# Walks lore's code-review line, converted, through this floor: a pull request opens, an agent in a
# real pod reviews the branch, a service station takes the review, the run settles. Needs a lore
# checkout to read (LORE_DIR) and `npm run minikube-setup` to have run. It reviews a public
# repository and posts nothing to it. Spends a little of the Claude credential in the cluster.
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

LORE_DIR="${LORE_DIR:-${HOME}/workspace/lore}"
[ -d "${LORE_DIR}/libs/assembly-lines" ] || fail "no lore checkout at ${LORE_DIR}; set LORE_DIR"

PORT="${PORT:-8099}"
BASE="http://localhost:${PORT}"
TOKEN="walk-review-service-token"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
REPOSITORY="${FLOOR_WALK_REPOSITORY:-github.com/octocat/Spoon-Knife}"
BRANCH="${FLOOR_WALK_BRANCH:-change-the-title}"
PULL_REQUEST="https://${REPOSITORY}/pull/walk-$(date +%s)"
WAIT_SECONDS="${FLOOR_WALK_WAIT_SECONDS:-900}"
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
  say "the floor's log"; tail -30 "${LOGS}/api.log" || true
  say "the cluster agent's log"; tail -30 "${LOGS}/cluster-agent.log" || true
  say "the post-review station's log"; tail -30 "${LOGS}/post-review.log" || true
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
}

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting the floor, the cluster agent, and the post-review station"
PORT="${PORT}" FLOOR_BASE_URL="http://host.minikube.internal:${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" \
  FLOOR_VISIT_TOKEN_SECRET="walk-review-secret" FLOOR_POLL_MS=200 \
  node apps/api/dist/index.js >"${LOGS}/api.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  curl -sf "${BASE}/readyz" >/dev/null && break
  sleep 0.2
done
curl -sf "${BASE}/readyz" >/dev/null || { what_went_wrong; fail "the floor did not become ready"; }

FLOOR_API_URL="${BASE}" FLOOR_CLUSTER_AGENT_TOKEN="${TOKEN}" FLOOR_HEALTH_PORT="$((PORT - 1))" FLOOR_CLAIM_MAX_IDLE_MS=5000 \
  node apps/cluster-agent/dist/index.js >"${LOGS}/cluster-agent.log" 2>&1 &
PIDS+=($!)
FLOOR_API_URL="${BASE}" FLOOR_SERVICE_TOKEN="${TOKEN}" node scripts/stations/post-review.mjs >"${LOGS}/post-review.log" 2>&1 &
PIDS+=($!)

say "converting lore's code-review from ${LORE_DIR}, and putting it to the floor"
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): nodes \([.line.body.nodes[].id] | join(" -> ")); stations \([.stations[].id] | join(", ")); agent definition \(.agentDefinitions[0].id)"'

say "a pull request opens: ${REPOSITORY}, branch ${BRANCH}"
api -X POST "${BASE}/events" -d @- >/dev/null <<JSON
{"name": "github.pull_request.opened", "payload": {
  "repository": "${REPOSITORY}", "head_ref": "${BRANCH}", "pull_request_url": "${PULL_REQUEST}",
  "title": "Review the change on branch ${BRANCH}", "draft": false}}
JSON

RUN=""
for _ in $(seq 1 50); do
  RUN="$(api "${BASE}/assembly-runs?subject=pr_url:${PULL_REQUEST}" | jq -r '.items[0].id // empty')"
  [ -n "${RUN}" ] && break
  sleep 0.2
done
[ -n "${RUN}" ] || { what_went_wrong; fail "the event started no run"; }
echo "run ${RUN}, started by the event"

say "waiting for the review, up to ${WAIT_SECONDS}s"
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
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason, review_summary: .bag.review_summary.ref}'

say "its visits"
api "${BASE}/station-runs?run=${RUN}" | jq -r '.items[] | "\(.nodeId)#\(.iteration)\t\(.report.outcome // "open")\t\(.worker // "-")\t\(.report.error // "")"'

REVIEW="$(api "${BASE}/station-runs?run=${RUN}&node=review" | jq -r '.items[-1].id')"
say "what the review cost"
api "${BASE}/station-runs/${REVIEW}/records?kind=llm_call" | jq -c '.items[].body | {costUsd, turns, durationMs}'

say "what the post-review station would have posted"
cat "${LOGS}/post-review.log"

POSTED="$(api "${BASE}/assembly-runs/${RUN}" | jq -r '.bag.review_summary.ref // empty')"
if [ "${OUTCOME}" != "success" ] || [ -z "${POSTED}" ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, review ${POSTED:-not taken by post-review}; logs kept in ${LOGS}"
fi

say "walked: lore's code-review, converted, settled as success"
