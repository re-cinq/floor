#!/usr/bin/env bash
# The one walk that reaches GitHub. It works on the pull request named on the command line, and
# has no default. Agents run in real pods; what is posted is posted as the GitHub App.
#
#   FLOOR_GITHUB_ENV_FILE=<file with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY> \
#     bash scripts/walk-real-review.sh https://github.com/<owner>/<name>/pull/<number> [what else]
#
#   (nothing)            lore's code-review, converted: the review is POSTED TO GITHUB, as a comment
#                        and never an approval or a request for changes. Nothing is pushed.
#   --then-fix           goes on to lore's code-review-reply, acting on the review just posted: an
#                        agent commits a fix and PUSHES IT TO THE PULL REQUEST'S BRANCH, and its
#                        reply is posted as a comment.
#   --fix-review <id>    no review of floor's own. A review already on GitHub, a person's, is
#                        delivered to the receiver as GitHub's webhook would deliver it, signed, and
#                        what that starts is walked: a fix PUSHED, and a reply posted.
#
# Whatever listens to the repository, CI or another floor, hears a push. The app's key is read by
# @floor/github from the env file, and is never on a command line or in a file of this script's.
# Needs `gh`, a lore checkout (LORE_DIR) and `npm run minikube-setup`.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
PULL_REQUEST="${1:-}"
THEN="${2:-}"
GIVEN_REVIEW="${3:-}"
[[ "${PULL_REQUEST}" =~ ^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)$ ]] || fail "name the pull request: https://github.com/<owner>/<name>/pull/<number>"
OWNER="${BASH_REMATCH[1]}"; NAME="${BASH_REMATCH[2]}"; NUMBER="${BASH_REMATCH[3]}"
case "${THEN}" in
  "" | --then-fix) [ -z "${GIVEN_REVIEW}" ] || fail "only --fix-review takes a review" ;;
  --fix-review) [[ "${GIVEN_REVIEW}" =~ ^[0-9]+$ ]] || fail "--fix-review takes the review's id, a number" ;;
  *) fail "what else is --then-fix, or --fix-review <id>" ;;
esac
[ -f "${FLOOR_GITHUB_ENV_FILE:-}" ] || fail "set FLOOR_GITHUB_ENV_FILE to a file holding GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY"
[ -f "${PROCESS_ENV_FILE}" ] || fail "${PROCESS_ENV_FILE} is missing: run 'npm run minikube-setup' first"
set -a
# shellcheck disable=SC1090
. "${PROCESS_ENV_FILE}"
set +a
export KUBECONFIG="${FLOOR_KUBECONFIG}"
# In a terminal gh shows what it fetched in a pager, where this walk's reader never sees it.
export GH_PAGER=cat

LORE_DIR="${LORE_DIR:-${HOME}/workspace/lore}"
[ -d "${LORE_DIR}/libs/assembly-lines" ] || fail "no lore checkout at ${LORE_DIR}; set LORE_DIR"

PORT="${PORT:-8099}"
GITHUB_PORT="$((PORT + 2))"
BASE="http://localhost:${PORT}"
RECEIVER="http://localhost:${GITHUB_PORT}/webhooks/github"
REPO_API="repos/${OWNER}/${NAME}"
TOKEN="walk-real-review-$(openssl rand -hex 8)"
WEBHOOK_SECRET="$(openssl rand -hex 16)"
MODEL="${FLOOR_WALK_MODEL:-claude-sonnet-4-6}"
WAIT_SECONDS="${FLOOR_WALK_WAIT_SECONDS:-1500}"
BY="walk-real-review.sh"
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

# Lore's line, converted, put to the floor. FLOOR_WALK_CONVERT is more for the converter, as it would be typed: what a cluster needs its agents to have.
put_line() {
  local more=()
  read -r -a more <<<"${FLOOR_WALK_CONVERT:-}"
  FLOOR_SERVICE_TOKEN="${TOKEN}" node packages/lore-converter/dist/cli.js \
    --lore "${LORE_DIR}" --line "$1" --model "${MODEL}" --put "${BASE}" "${more[@]}" \
    | jq -r '"line \(.line.id): enters at \(.line.body.entry); nodes \([.line.body.nodes[].id] | join(", ")); stations \([.stations[].id] | join(", "))"'
}

# Starts a line by hand with the items read on stdin, and says the run's id. A run already open on
# this pull request would take the start as its own: that is work already on its way, and not this.
started() {
  local line="$1" answer
  answer="$(api -X POST "${BASE}/assembly-lines/${line}/start" -d @-)"
  [ "$(jq -r .joined <<<"${answer}")" = "false" ] || fail "a run is already open on ${PULL_REQUEST}: $(jq -r .run.id <<<"${answer}"); cancel it, or wait for it"
  jq -r .run.id <<<"${answer}"
}

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

# Floor's own review of the pull request, posted. Says the review's id on the last line.
review_posted() {
  local before after run outcome
  before="$(gh api "${REPO_API}/pulls/${NUMBER}/reviews" --paginate --jq 'length')"

  say "converting lore's code-review from ${LORE_DIR}, and putting it to the floor"
  put_line code-review

  say "starting the review of ${OWNER}/${NAME}#${NUMBER}, branch ${BRANCH}"
  run="$(jq -n --arg repo "github.com/${OWNER}/${NAME}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" --arg by "${BY}" \
    --arg description "Review pull request #${NUMBER} in ${OWNER}/${NAME} (branch ${BRANCH})." '{
      repo: $repo, startItems: {
        repo: {kind: "git", ref: "\($repo)@\($branch)", by: $by},
        pr_url: {kind: "value", ref: $url, by: $by},
        description: {kind: "value", ref: $description, by: $by}}}' | started code-review)"
  echo "run ${run}"

  say "waiting for the review, up to ${WAIT_SECONDS}s"
  outcome="$(settled "${run}")"
  told "${run}" review

  say "the pull request's reviews, as GitHub has them now"
  gh api "${REPO_API}/pulls/${NUMBER}/reviews" --paginate --jq '.[] | {id, by: .user.login, state, url: .html_url, body: (.body | .[0:160])}'
  after="$(gh api "${REPO_API}/pulls/${NUMBER}/reviews" --paginate --jq 'length')"

  if [ "${outcome}" != "success" ] || [ "$((after - before))" -ne 1 ]; then
    what_went_wrong
    fail "outcome ${outcome}, reviews posted $((after - before)); logs kept in ${LOGS}"
  fi
  say "reviewed: ${run} settled as success; one review posted to ${PULL_REQUEST}"
  REVIEW_ID="$(api "${BASE}/assembly-runs/${run}" | jq -r '.bag.review_url.ref | sub(".*#pullrequestreview-"; "")')"
  [[ "${REVIEW_ID}" =~ ^[0-9]+$ ]] || fail "the review's address names no review: ${REVIEW_ID}"
}

# The fix started by hand, acting on a review of floor's own. A bot's review starts nothing by itself, by the line's own rule.
fix_started_by_hand() {
  jq -n --arg repo "github.com/${OWNER}/${NAME}" --arg branch "${BRANCH}" --arg url "${PULL_REQUEST}" --arg review "${REVIEW_ID}" --arg by "${BY}" '{
      repo: $repo, startItems: {
        repo: {kind: "git", ref: "\($repo)@\($branch)", by: $by},
        pr_url: {kind: "value", ref: $url, by: $by},
        review_id: {kind: "value", ref: $review, by: $by},
        intent: {kind: "value", ref: "address", by: $by}}}' | started code-review-reply
}

# The fix started as GitHub would start it: the review, as GitHub has it, delivered to the receiver as its webhook, signed. The payload is put together from GitHub's own record, in the webhook's shape.
fix_started_by_webhook() {
  local review pull webhook signature status found=""
  review="$(gh api "${REPO_API}/pulls/${NUMBER}/reviews/${REVIEW_ID}")"
  pull="$(gh api "${REPO_API}/pulls/${NUMBER}")"
  jq -c '{by: .user.login, type: .user.type, state, association: .author_association}' <<<"${review}" >&2
  webhook="$(jq -cn --argjson review "${review}" --argjson pull "${pull}" '{
    action: "submitted",
    repository: {full_name: $pull.base.repo.full_name},
    sender: {login: $review.user.login, type: $review.user.type},
    review: {id: $review.id, state: ($review.state | ascii_downcase), body: $review.body, html_url: $review.html_url, author_association: $review.author_association},
    pull_request: {number: $pull.number, html_url: $pull.html_url, title: $pull.title, draft: $pull.draft, merged: $pull.merged,
                   head: {ref: $pull.head.ref, sha: $pull.head.sha}, base: {ref: $pull.base.ref}}}')"
  signature="sha256=$(printf '%s' "${webhook}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" | sed 's/^.* //')"
  status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${RECEIVER}" -H "x-github-event: pull_request_review" \
    -H "x-github-delivery: ${BY}-$(date +%s%N)" -H "x-hub-signature-256: ${signature}" -d "${webhook}")"
  echo "the receiver took it: ${status}" >&2
  [ "${status}" = "202" ] || { what_went_wrong >&2; fail "the receiver answered ${status} to the webhook"; }
  for _ in $(seq 1 50); do
    found="$(api "${BASE}/assembly-runs?line=code-review-reply&subject=pr_url:${PULL_REQUEST}&open=true" | jq -r '.items[0].id // empty')"
    [ -n "${found}" ] && break
    sleep 0.2
  done
  [ -n "${found}" ] || { what_went_wrong >&2; fail "the review started no run: it is a bot's, a stranger's, or asks for no changes"; }
  echo "${found}"
}

# The fix, walked, and what it left on GitHub read back from GitHub.
fix_walked() {
  local started_by="$1" head_before head_after comments_before comments_after run outcome moved
  head_before="$(gh api "${REPO_API}/pulls/${NUMBER}" --jq .head.sha)"
  comments_before="$(gh api "${REPO_API}/issues/${NUMBER}/comments" --paginate --jq 'length')"

  say "converting lore's code-review-reply, and putting it to the floor"
  put_line code-review-reply

  say "starting the fix, acting on review ${REVIEW_ID}; the branch is at ${head_before:0:10}"
  run="$("${started_by}")"
  echo "run ${run}"

  say "waiting for the fix, up to ${WAIT_SECONDS}s"
  outcome="$(settled "${run}")"
  told "${run}" reply

  say "the branch, as GitHub has it now"
  head_after="$(gh api "${REPO_API}/pulls/${NUMBER}" --jq .head.sha)"
  echo "before ${head_before:0:10}, after ${head_after:0:10}"
  moved="$([ "${head_after}" != "${head_before}" ] && echo yes || echo no)"
  if [ "${moved}" = "yes" ]; then
    gh api "${REPO_API}/compare/${head_before}...${head_after}" \
      --jq '{ahead_by, behind_by, commits: [.commits[] | {sha: .sha[0:10], author: .commit.author.name, message: (.commit.message | split("\n")[0])}], files: [.files[] | "\(.filename) +\(.additions) -\(.deletions)"]}'
  fi

  say "the pull request's comments since, as GitHub has them"
  gh api "${REPO_API}/issues/${NUMBER}/comments" --paginate --jq ".[${comments_before}:] | .[] | {by: .user.login, url: .html_url, body: (.body | .[0:400])}"
  comments_after="$(gh api "${REPO_API}/issues/${NUMBER}/comments" --paginate --jq 'length')"

  if [ "${outcome}" != "success" ] || [ "${moved}" = "no" ] || [ "${comments_after}" -le "${comments_before}" ]; then
    what_went_wrong
    fail "outcome ${outcome}, branch moved: ${moved}, comments posted $((comments_after - comments_before)); logs kept in ${LOGS}"
  fi
  say "fixed: ${run} settled as success; a commit pushed to ${BRANCH}, and a reply posted to ${PULL_REQUEST}"
}

say "the pull request, as GitHub has it"
PULL="$(gh pr view "${NUMBER}" --repo "${OWNER}/${NAME}" --json state,isDraft,headRefName,title,isCrossRepository)"
jq -c . <<<"${PULL}"
[ "$(jq -r .state <<<"${PULL}")" = "OPEN" ] || fail "the pull request is not open"
[ "$(jq -r .isCrossRepository <<<"${PULL}")" = "false" ] || fail "the pull request is from a fork, whose branch is not in ${OWNER}/${NAME}"
BRANCH="$(jq -r .headRefName <<<"${PULL}")"

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
  GITHUB_GIT_CREDENTIALS=1 GITHUB_REVIEW_ROUTER=0 GITHUB_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  node --env-file="${FLOOR_GITHUB_ENV_FILE}" apps/github/dist/index.js >"${LOGS}/github.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  grep -q "stations are claiming" "${LOGS}/github.log" && break
  sleep 0.2
done
grep -q "stations are claiming" "${LOGS}/github.log" || { what_went_wrong; fail "@floor/github did not start its stations"; }
cat "${LOGS}/github.log"

REVIEW_ID="${GIVEN_REVIEW}"
[ "${THEN}" = "--fix-review" ] || review_posted
[ "${THEN}" != "--then-fix" ] || fix_walked fix_started_by_hand
[ "${THEN}" != "--fix-review" ] || fix_walked fix_started_by_webhook

say "waiting for the cluster agent to clean up after the walk"
wait_for_cleanup
