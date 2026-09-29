#!/usr/bin/env bash
# Reviews one real pull request: lore's code-review line, converted, with an agent in a real pod,
# and the review POSTED TO GITHUB as the GitHub App. It posts a comment review, never an approval
# or a request for changes, and pushes nothing. The pull request is named on the command line;
# there is no default.
#
#   FLOOR_GITHUB_ENV_FILE=<file with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY> \
#     bash scripts/walk-real-review.sh https://github.com/<owner>/<name>/pull/<number> [--then-fix]
#
# With --then-fix it goes on: lore's code-review-reply, converted, acts on the review just posted.
# An agent in a real pod commits a fix and PUSHES IT TO THE PULL REQUEST'S BRANCH, and its reply is
# posted as a comment. Whatever listens to that repository, CI or another floor, hears the push.
#
# The app's key is read by @floor/github from that file, and is never on a command line or in a
# file of this script's. Needs `gh`, a lore checkout (LORE_DIR) and `npm run minikube-setup`.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
PULL_REQUEST="${1:-}"
THEN="${2:-}"
[ -z "${THEN}" ] || [ "${THEN}" = "--then-fix" ] || fail "the only thing to add is --then-fix"
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

# Waits for a run to settle, saying what the pods do meanwhile, and says its outcome.
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

# A run as it ended: its bag, its visits in order, and what the agent at one of its nodes cost.
told() {
  local run="$1" node="$2" visit
  say "the run"
  api "${BASE}/assembly-runs/${run}" | jq '{outcome: .run.outcome, reason: .run.reason, bag: (.bag | map_values(.ref))}'
  say "its visits, in order"
  api "${BASE}/station-runs?run=${run}" | jq -r '.items | sort_by(.openedAt)[] | "\(.nodeId)\t\(.report.outcome // "open")\t\(.report.error // "")"'
  say "what the agent cost"
  visit="$(api "${BASE}/station-runs?run=${run}" | jq -r --arg node "${node}" '.items | map(select(.nodeId == $node)) | .[0].id')"
  api "${BASE}/station-runs/${visit}/records?kind=llm_call" | jq -c '.items[].body | {costUsd, turns, durationMs}'
}

say "waiting for the review, up to ${WAIT_SECONDS}s"
OUTCOME="$(settled "${RUN}")"
told "${RUN}" review

say "the pull request's reviews, as GitHub has them now"
gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}/reviews" --paginate \
  --jq '.[] | {id, by: .user.login, state, url: .html_url, body: (.body | .[0:160])}'
REVIEWS_AFTER="$(gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}/reviews" --paginate --jq 'length')"

if [ "${OUTCOME}" != "success" ] || [ "$((REVIEWS_AFTER - REVIEWS_BEFORE))" -ne 1 ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, reviews posted $((REVIEWS_AFTER - REVIEWS_BEFORE)); logs kept in ${LOGS}"
fi

say "reviewed: ${RUN} settled as success; one review posted to ${PULL_REQUEST}"

if [ "${THEN}" != "--then-fix" ]; then
  say "waiting for the cluster agent to clean up after the walk"
  wait_for_cleanup
  exit 0
fi

REVIEW_ID="$(api "${BASE}/assembly-runs/${RUN}" | jq -r '.bag.review_url.ref | sub(".*#pullrequestreview-"; "")')"
[[ "${REVIEW_ID}" =~ ^[0-9]+$ ]] || fail "the review's address names no review: ${REVIEW_ID}"
HEAD_BEFORE="$(gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}" --jq .head.sha)"
COMMENTS_BEFORE="$(gh api "repos/${OWNER}/${NAME}/issues/${NUMBER}/comments" --paginate --jq 'length')"

say "converting lore's code-review-reply, and putting it to the floor"
FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
  --lore "${LORE_DIR}" --line code-review-reply --model "${MODEL}" --put "${BASE}" \
  | jq -r '"line \(.line.id): enters at \(.line.body.entry); nodes \([.line.body.nodes[].id] | join(", "))"'

say "starting the fix, acting on review ${REVIEW_ID}; the branch is at ${HEAD_BEFORE:0:10}"
FIX="$(jq -n --arg repo "github.com/${OWNER}/${NAME}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" --arg review "${REVIEW_ID}" '{
    repo: $repo, startItems: {
      repo: {kind: "git", ref: "\($repo)@\($branch)", by: "walk-real-review.sh"},
      pr_url: {kind: "value", ref: $url, by: "walk-real-review.sh"},
      review_id: {kind: "value", ref: $review, by: "walk-real-review.sh"},
      intent: {kind: "value", ref: "address", by: "walk-real-review.sh"}}}' \
  | api -X POST "${BASE}/assembly-lines/code-review-reply/start" -d @-)"
[ "$(jq -r .joined <<<"${FIX}")" = "false" ] || fail "a run is already open on ${PULL_REQUEST}: $(jq -r .run.id <<<"${FIX}")"
FIX="$(jq -r .run.id <<<"${FIX}")"
echo "run ${FIX}"

say "waiting for the fix, up to ${WAIT_SECONDS}s"
FIXED="$(settled "${FIX}")"
told "${FIX}" reply

say "the branch, as GitHub has it now"
HEAD_AFTER="$(gh api "repos/${OWNER}/${NAME}/pulls/${NUMBER}" --jq .head.sha)"
echo "before ${HEAD_BEFORE:0:10}, after ${HEAD_AFTER:0:10}"
if [ "${HEAD_AFTER}" != "${HEAD_BEFORE}" ]; then
  gh api "repos/${OWNER}/${NAME}/compare/${HEAD_BEFORE}...${HEAD_AFTER}" \
    --jq '{ahead_by, behind_by, commits: [.commits[] | {sha: .sha[0:10], author: .commit.author.name, message: (.commit.message | split("\n")[0])}], files: [.files[] | "\(.filename) +\(.additions) -\(.deletions)"]}'
fi

say "the pull request's comments since, as GitHub has them"
gh api "repos/${OWNER}/${NAME}/issues/${NUMBER}/comments" --paginate \
  --jq ".[${COMMENTS_BEFORE}:] | .[] | {by: .user.login, url: .html_url, body: (.body | .[0:400])}"
COMMENTS_AFTER="$(gh api "repos/${OWNER}/${NAME}/issues/${NUMBER}/comments" --paginate --jq 'length')"

say "waiting for the cluster agent to clean up after the walk"
wait_for_cleanup

MOVED="$([ "${HEAD_AFTER}" != "${HEAD_BEFORE}" ] && echo yes || echo no)"
if [ "${FIXED}" != "success" ] || [ "${MOVED}" = "no" ] || [ "${COMMENTS_AFTER}" -le "${COMMENTS_BEFORE}" ]; then
  what_went_wrong
  fail "outcome ${FIXED}, branch moved: ${MOVED}, comments posted $((COMMENTS_AFTER - COMMENTS_BEFORE)); logs kept in ${LOGS}"
fi

say "fixed: ${FIX} settled as success; a commit pushed to ${BRANCH}, and a reply posted to ${PULL_REQUEST}"
