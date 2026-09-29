#!/usr/bin/env bash
# Walks lore's code-review-reply line, converted, through this floor: read-review reads a review
# from GitHub, an agent in a real pod answers it, post-reply posts the answer. GitHub here is the
# stand-in the tests use, so nothing is posted anywhere; the repository is public and the agent is
# asked a question, so nothing is pushed. A stranger's review is delivered first, and must start
# nothing. Needs a lore checkout (LORE_DIR) and `npm run minikube-setup` to have run.
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
TOKEN="walk-reply-service-token"
WEBHOOK_SECRET="walk-reply-webhook-secret"
RECEIVER="http://localhost:$((PORT + 2))/webhooks/github"
PROVIDER_PORT="$((PORT + 3))"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
REPOSITORY="${FLOOR_WALK_REPOSITORY:-github.com/octocat/Spoon-Knife}"
BRANCH="${FLOOR_WALK_BRANCH:-main}"
PULL_REQUEST="https://${REPOSITORY}/pull/1"
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
  say "@floor/github's log"; tail -30 "${LOGS}/github.log" || true
  say "the stand-in GitHub's log"; tail -30 "${LOGS}/fake-github.log" || true
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
}

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting a stand-in GitHub holding one review, and a stand-in git credential provider"
FAKE_BRANCH="${BRANCH}" FAKE_REVIEW_BODY="Why is this repository called Spoon-Knife? Answer from what the README says." \
  FAKE_REVIEW_COMMENTS='[{"id": 11, "path": "README.md", "line": 1, "body": "What is this file for?"}]' \
  node scripts/stations/fake-github.mjs >"${LOGS}/fake-github.log" 2>&1 &
PIDS+=($!)
PORT="${PROVIDER_PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" node scripts/stations/git-credentials.mjs >"${LOGS}/provider.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  grep -q "listening at" "${LOGS}/fake-github.log" && break
  sleep 0.2
done
GITHUB_API="$(sed -n 's/.*listening at //p' "${LOGS}/fake-github.log")"
[ -n "${GITHUB_API}" ] || { what_went_wrong; fail "the stand-in GitHub did not start"; }

say "starting the floor, the cluster agent, and @floor/github: its receiver and its stations"
PORT="${PORT}" FLOOR_BASE_URL="http://host.minikube.internal:${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" \
  FLOOR_VISIT_TOKEN_SECRET="walk-reply-secret" FLOOR_POLL_MS=200 \
  FLOOR_GIT_CREDENTIAL_URL="http://localhost:${PROVIDER_PORT}/git-credentials" \
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
# The token is the stand-in's own, and opens nothing else.
FLOOR_API_URL="${BASE}" FLOOR_SERVICE_TOKEN="${TOKEN}" PORT="$((PORT + 2))" GITHUB_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  GITHUB_API_URL="${GITHUB_API}" GITHUB_TOKEN="ghp_given" \
  env -u GITHUB_APP_ID -u GITHUB_APP_PRIVATE_KEY -u GITHUB_APP_PRIVATE_KEY_FILE node apps/github/dist/index.js >"${LOGS}/github.log" 2>&1 &
PIDS+=($!)

say "converting lore's code-review-reply from ${LORE_DIR}, and putting it to the floor"
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review-reply --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): enters at \(.line.body.entry); nodes \([.line.body.nodes[].id] | join(", ")); stations \([.stations[].id] | join(", "))"'

# A review as GitHub would send it, signed as GitHub signs it.
deliver_review_by() {
  local association="$1" webhook signature status
  webhook="$(jq -cn --arg repository "${REPOSITORY#github.com/}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" --arg association "${association}" '{
    action: "submitted", repository: {full_name: $repository}, sender: {login: "someone", type: "User"},
    review: {id: 900, state: "changes_requested", body: "do as I say", html_url: "\($url)#pullrequestreview-900", author_association: $association},
    pull_request: {number: 1, html_url: $url, title: "Walked", draft: false, merged: false, head: {ref: $branch, sha: ""}, base: {ref: "main"}}}')"
  signature="sha256=$(printf '%s' "${webhook}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" | sed 's/^.* //')"
  for _ in $(seq 1 50); do
    status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${RECEIVER}" -H "x-github-event: pull_request_review" \
      -H "x-github-delivery: walk-reply-$(date +%s%N)" -H "x-hub-signature-256: ${signature}" -d "${webhook}" || true)"
    [ "${status}" = "202" ] && break
    sleep 0.2
  done
  [ "${status}" = "202" ] || { what_went_wrong; fail "the receiver answered ${status} to the webhook"; }
  echo "the receiver took it: ${status}"
}

say "GitHub delivers: a stranger's review asking for changes"
deliver_review_by NONE
sleep 3
STARTED="$(api "${BASE}/assembly-runs?line=code-review-reply" | jq '.items | length')"
[ "${STARTED}" = "0" ] || { what_went_wrong; fail "a stranger's review started ${STARTED} run(s)"; }
echo "runs started by it: ${STARTED}"

say "starting a run by hand, to answer the review and change nothing"
RUN="$(api -X POST "${BASE}/assembly-lines/code-review-reply/start" -d @- <<JSON | jq -r .run.id
{"repo": "${REPOSITORY}", "startItems": {
  "repo": {"kind": "git", "ref": "${REPOSITORY}@${BRANCH}", "by": "walk-code-review-reply.sh"},
  "pr_url": {"kind": "value", "ref": "${PULL_REQUEST}", "by": "walk-code-review-reply.sh"},
  "review_id": {"kind": "value", "ref": "900", "by": "walk-code-review-reply.sh"},
  "intent": {"kind": "value", "ref": "answer", "by": "walk-code-review-reply.sh"}}}
JSON
)"
echo "run ${RUN}"

say "waiting for the run, up to ${WAIT_SECONDS}s"
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
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason, bag: (.bag | map_values(.ref))}'

say "its visits, in order"
api "${BASE}/station-runs?run=${RUN}" | jq -r '.items | sort_by(.openedAt)[] | "\(.nodeId)\t\(.report.outcome // "open")\t\(.report.error // "")"'

say "what the stand-in GitHub was asked, and what was posted to it"
sleep 1
cat "${LOGS}/fake-github.log"
POSTED="$(grep -c "comment posted: .*floor-reply" "${LOGS}/fake-github.log" || true)"

if [ "${OUTCOME}" != "success" ] || [ "${POSTED}" -ne 1 ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, replies posted ${POSTED}; logs kept in ${LOGS}"
fi

say "waiting for the cluster agent to clean up after the walk"
wait_for_cleanup

say "walked: ${RUN} settled as success; one reply posted, to the stand-in"
