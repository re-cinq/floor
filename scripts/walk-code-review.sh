#!/usr/bin/env bash
# Walks lore's code-review line, converted, through this floor: GitHub's webhook for a pull request
# opening arrives signed at the receiver, an agent in a real pod reviews the branch, a service
# station takes the review, the run settles. Needs a lore
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
WEBHOOK_SECRET="walk-review-webhook-secret"
RECEIVER="http://localhost:$((PORT + 2))/webhooks/github"
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
  say "the webhook receiver's log"; tail -30 "${LOGS}/github.log" || true
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
}

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting the floor, the cluster agent, the webhook receiver, and the post-review station"
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
# The receiver and the review router: with no GitHub credential, @floor/github starts no post-review station of its own.
FLOOR_API_URL="${BASE}" FLOOR_SERVICE_TOKEN="${TOKEN}" PORT="$((PORT + 2))" GITHUB_WEBHOOK_SECRET="${WEBHOOK_SECRET}" GITHUB_REVIEW_ROUTER=1 \
  env -u GITHUB_TOKEN -u GITHUB_APP_ID node apps/github/dist/index.js >"${LOGS}/github.log" 2>&1 &
PIDS+=($!)

say "converting lore's code-review from ${LORE_DIR}, and putting it to the floor"
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): nodes \([.line.body.nodes[].id] | join(" -> ")); stations \([.stations[].id] | join(", ")); agent definition \(.agentDefinitions[0].id)"'
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review-recheck --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): nodes \([.line.body.nodes[].id] | join(" -> "))"'

# What GitHub would send, signed as GitHub signs it.
deliver() {
  local action="$1" webhook signature status
  webhook="$(jq -cn --arg action "${action}" --arg repository "${REPOSITORY#github.com/}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" '{
    action: $action, number: 1,
    repository: {full_name: $repository}, sender: {login: "walk-code-review.sh"},
    pull_request: {html_url: $url, title: "Review the change on branch \($branch)", draft: false, merged: false,
                   head: {ref: $branch, sha: ""}, base: {ref: "main"}}}')"
  signature="sha256=$(printf '%s' "${webhook}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" | sed 's/^.* //')"
  for _ in $(seq 1 50); do
    status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${RECEIVER}" -H "x-github-event: pull_request" \
      -H "x-github-delivery: walk-${action}-$(date +%s%N)" -H "x-hub-signature-256: ${signature}" -d "${webhook}" || true)"
    [ "${status}" = "202" ] && break
    sleep 0.2
  done
  [ "${status}" = "202" ] || { what_went_wrong; fail "the receiver answered ${status} to the webhook"; }
  echo "the receiver took it: ${status}"
}

# The id of the run of a line on this pull request, once there is one.
run_of() {
  local line="$1" found=""
  for _ in $(seq 1 100); do
    found="$(api "${BASE}/assembly-runs?line=${line}&subject=pr_url:${PULL_REQUEST}&open=$2" | jq -r '.items[0].id // empty')"
    [ -n "${found}" ] && break
    sleep 0.2
  done
  echo "${found}"
}

# Waits for a run to settle, and says its outcome.
settled() {
  local run="$1" outcome=null seen="" now
  for _ in $(seq 1 "$((WAIT_SECONDS / 5))"); do
    outcome="$(api "${BASE}/assembly-runs/${run}" | jq -r .run.outcome)"
    [ "${outcome}" != "null" ] && break
    now="$(kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get pods --no-headers 2>/dev/null | awk '!/agent-controller/ {printf "%s  ", $3}' || true)"
    if [ "${now}" != "${seen}" ]; then echo "  pods: ${now:-none yet}" >&2; seen="${now}"; fi
    sleep 5
  done
  echo "${outcome}"
}

say "GitHub delivers: a pull request opened on ${REPOSITORY}, branch ${BRANCH}"
deliver opened

RUN="$(run_of code-review true)"
[ -n "${RUN}" ] || { what_went_wrong; fail "the webhook started no run"; }
echo "run ${RUN}, started by the webhook"

say "waiting for the review, up to ${WAIT_SECONDS}s"
OUTCOME="$(settled "${RUN}")"

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

say "GitHub delivers: a push to the same pull request"
deliver synchronize
RECHECK="$(run_of code-review-recheck true)"
[ -n "${RECHECK}" ] || { what_went_wrong; fail "the push started no recheck"; }
echo "the router chose the recheck, the pull request having been reviewed: run ${RECHECK}"

say "waiting for the recheck, up to ${WAIT_SECONDS}s"
RECHECKED="$(settled "${RECHECK}")"
api "${BASE}/assembly-runs/${RECHECK}" | jq '{outcome: .run.outcome, reason: .run.reason, review_summary: .bag.review_summary.ref}'
api "${BASE}/station-runs?run=${RECHECK}" | jq -r '.items[] | "\(.nodeId)#\(.iteration)\t\(.report.outcome // "open")\t\(.report.error // "")"'
[ "${RECHECKED}" = "success" ] || { what_went_wrong; fail "the recheck ended as ${RECHECKED}; logs kept in ${LOGS}"; }

say "walked: lore's code-review and its recheck, converted, both settled as success"
