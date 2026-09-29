#!/usr/bin/env bash
# Reviews one real pull request: lore's code-review line, converted, with an agent in a real pod,
# and the review POSTED TO GITHUB as the GitHub App. It posts a comment review, never an approval
# or a request for changes, and pushes nothing. The pull request is named on the command line;
# there is no default.
#
#   FLOOR_GITHUB_ENV_FILE=<file with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY> \
#     bash scripts/walk-real-review.sh https://github.com/<owner>/<name>/pull/<number>
#
# The app's key is read by @floor/github from that file, and is never on a command line or in a
# file of this script's. Needs `gh`, a lore checkout (LORE_DIR) and `npm run minikube-setup`.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
PULL_REQUEST="${1:-}"
[[ "${PULL_REQUEST}" =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)$ ]] || fail "name the pull request: https://github.com/<owner>/<name>/pull/<number>"
OWNER="${BASH_REMATCH[1]}"; NAME="${BASH_REMATCH[2]}"; NUMBER="${BASH_REMATCH[3]}"
[ -f "${FLOOR_GITHUB_ENV_FILE:-}" ] || fail "set FLOOR_GITHUB_ENV_FILE to a file holding GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY"
[ -f "${PROCESS_ENV_FILE}" ] || fail "${PROCESS_ENV_FILE} is missing: run 'npm run minikube-setup' first"
set -a
# shellcheck disable=SC1090
. "${PROCESS_ENV_FILE}"
set +a
export KUBECONFIG="${FLOOR_KUBECONFIG}"

LORE_DIR="${LORE_DIR:-${HOME}/workspace/lore}"
[ -d "${LORE_DIR}/libs/assembly-lines" ] || fail "no lore checkout at ${LORE_DIR}; set LORE_DIR"

PORT="${PORT:-8099}"
GITHUB_PORT="$((PORT + 2))"
BASE="http://localhost:${PORT}"
TOKEN="walk-real-review-$(openssl rand -hex 8)"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
WAIT_SECONDS="${FLOOR_WALK_WAIT_SECONDS:-1500}"
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
  say "agents and pods in ${FLOOR_AGENTS_NAMESPACE}"
  kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents,pods 2>&1 || true
}

say "the pull request, as GitHub has it"
PULL="$(gh pr view "${NUMBER}" --repo "${OWNER}/${NAME}" --json state,isDraft,headRefName,title,isCrossRepository)"
jq -c . <<<"${PULL}"
[ "$(jq -r .state <<<"${PULL}")" = "OPEN" ] || fail "the pull request is not open"
[ "$(jq -r .isCrossRepository <<<"${PULL}")" = "false" ] || fail "the pull request is from a fork, whose branch is not in ${OWNER}/${NAME}"
BRANCH="$(jq -r .headRefName <<<"${PULL}")"
REVIEWS_BEFORE="$(gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}/reviews" --paginate --jq 'length')"

npm run --silent db:up >/dev/null
npm run --silent build >/dev/null

say "starting the floor, the cluster agent, and @floor/github as the GitHub App"
PORT="${PORT}" FLOOR_BASE_URL="http://host.minikube.internal:${PORT}" FLOOR_SERVICE_TOKEN="${TOKEN}" \
  FLOOR_VISIT_TOKEN_SECRET="$(openssl rand -hex 16)" FLOOR_POLL_MS=200 \
  FLOOR_GIT_CREDENTIAL_URL="http://localhost:${GITHUB_PORT}/git-credentials" \
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
# What is set here wins over the file, so the file gives the app and nothing else that matters.
FLOOR_API_URL="${BASE}" FLOOR_SERVICE_TOKEN="${TOKEN}" PORT="${GITHUB_PORT}" GITHUB_API_URL="https://api.github.com" \
  GITHUB_GIT_CREDENTIALS=1 GITHUB_REVIEW_ROUTER=0 \
  node --env-file="${FLOOR_GITHUB_ENV_FILE}" apps/github/dist/index.js >"${LOGS}/github.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  grep -q "stations are claiming" "${LOGS}/github.log" && break
  sleep 0.2
done
grep -q "stations are claiming" "${LOGS}/github.log" || { what_went_wrong; fail "@floor/github did not start its stations"; }
cat "${LOGS}/github.log"

say "converting lore's code-review from ${LORE_DIR}, and putting it to the floor"
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): nodes \([.line.body.nodes[].id] | join(" -> ")); stations \([.stations[].id] | join(", "))"'

say "starting the review of ${OWNER}/${NAME}#${NUMBER}, branch ${BRANCH}"
RUN="$(jq -n --arg repo "github.com/${OWNER}/${NAME}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" \
  --arg description "Review pull request #${NUMBER} in ${OWNER}/${NAME} (branch ${BRANCH})." '{
    repo: $repo, startItems: {
      repo: {kind: "git", ref: "\($repo)@\($branch)", by: "walk-real-review.sh"},
      pr_url: {kind: "value", ref: $url, by: "walk-real-review.sh"},
      description: {kind: "value", ref: $description, by: "walk-real-review.sh"}}}' \
  | api -X POST "${BASE}/assembly-lines/code-review/start" -d @-)"
# A run already open on this pull request takes the start as its own: that is a review already on its way, and not this one.
[ "$(jq -r .joined <<<"${RUN}")" = "false" ] || fail "a run is already open on ${PULL_REQUEST}: $(jq -r .run.id <<<"${RUN}"); cancel it, or wait for it"
RUN="$(jq -r .run.id <<<"${RUN}")"
echo "run ${RUN}"

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
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason, bag: (.bag | map_values(.ref))}'

say "its visits, in order"
api "${BASE}/station-runs?run=${RUN}" | jq -r '.items | sort_by(.openedAt)[] | "\(.nodeId)\t\(.report.outcome // "open")\t\(.report.error // "")"'

say "what the agent cost"
REVIEW_VISIT="$(api "${BASE}/station-runs?run=${RUN}" | jq -r '.items | map(select(.nodeId == "review")) | .[0].id')"
api "${BASE}/station-runs/${REVIEW_VISIT}/records?kind=llm_call" | jq -c '.items[].body | {costUsd, turns, durationMs}'

say "the pull request's reviews, as GitHub has them now"
gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}/reviews" --paginate \
  --jq '.[] | {id, by: .user.login, state, url: .html_url, body: (.body | .[0:160])}'
REVIEWS_AFTER="$(gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}/reviews" --paginate --jq 'length')"

say "waiting for the cluster agent to clean up after the walk"
wait_for_cleanup

if [ "${OUTCOME}" != "success" ] || [ "$((REVIEWS_AFTER - REVIEWS_BEFORE))" -ne 1 ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, reviews posted $((REVIEWS_AFTER - REVIEWS_BEFORE)); logs kept in ${LOGS}"
fi

say "reviewed: ${RUN} settled as success; one review posted to ${PULL_REQUEST}"
