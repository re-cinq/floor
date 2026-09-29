#!/usr/bin/env bash
# Walks one run through the floor as the chart installs it: the image built from this checkout,
# the api, the cluster agent and the subsystem's controller in a namespace of their own in
# minikube, a pipeline seeded by the chart's Job, and the run watched over the live channel.
# Needs `npm run minikube-setup` to have run: the pull secret and the model's credential are
# copied, cluster to cluster, from the namespace it made. Everything is removed at the end;
# FLOOR_WALK_KEEP=1 keeps it.
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

COPY_FROM="${FLOOR_AGENTS_NAMESPACE}"
# Which key of agent-secrets holds each model family's credential, as setup wrote it: names, never values.
MODEL_SECRET_KEYS="${FLOOR_MODEL_SECRET_KEYS:-}"
NAMESPACE="${FLOOR_WALK_NAMESPACE:-floor-chart-walk}"
DATABASE="floor_chart_walk"
PORT="${PORT:-8097}"
BASE="http://localhost:${PORT}"
TOKEN="walk-chart-service-token"
VERSION="walk-$(git rev-parse --short HEAD)"
WAIT_SECONDS="${FLOOR_WALK_WAIT_SECONDS:-600}"
LOGS="$(mktemp -d)"
PIDS=()

say() { printf '\n== %s\n' "$*"; }
api() { curl -sS --fail-with-body -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' "$@"; }
in_namespace() { kubectl -n "${NAMESPACE}" "$@"; }

[ "${NAMESPACE}" != "${COPY_FROM}" ] || fail "the walk removes its namespace at the end: it cannot be ${COPY_FROM}"
[ "${NAMESPACE}" != "ai-agents" ] || fail "ai-agents is lore's"
if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 && [ "${FLOOR_WALK_KEEP:-}" != "1" ]; then
  fail "namespace ${NAMESPACE} is already there, and the walk would remove it: remove it yourself, or name another in FLOOR_WALK_NAMESPACE"
fi

clean_up() {
  local pid
  for pid in "${PIDS[@]}"; do kill "${pid}" 2>/dev/null || true; done
  wait 2>/dev/null || true
  if [ "${FLOOR_WALK_KEEP:-}" = "1" ]; then
    echo "kept: namespace ${NAMESPACE}, database ${DATABASE}, logs in ${LOGS}"
    return
  fi
  say "removing the release, namespace ${NAMESPACE} and database ${DATABASE}"
  helm -n "${NAMESPACE}" uninstall floor --wait >/dev/null 2>&1 || true
  kubectl delete namespace "${NAMESPACE}" --wait=true --timeout=120s >/dev/null 2>&1 || true
  docker exec floor-postgres psql -U postgres -qc "drop database if exists ${DATABASE} with (force)" >/dev/null 2>&1 || true
}
trap clean_up EXIT
trap 'exit 143' TERM INT

what_went_wrong() {
  say "what is in ${NAMESPACE}"
  in_namespace get deployments,jobs,pods,agents,networkpolicy 2>&1 || true
  in_namespace get events --sort-by=.lastTimestamp 2>&1 | tail -20 || true
  say "the api's log"; in_namespace logs deployment/floor-api --tail=40 2>&1 || true
  say "the cluster agent's log"; in_namespace logs deployment/floor-cluster-agent --tail=40 2>&1 || true
  say "the seed job's log"; in_namespace logs job/floor-pipeline-seed --tail=40 2>&1 || true
}

# Cluster to cluster, through a pipe: what a secret holds is never shown, and never on this machine's disk.
copy_secret() {
  local name="$1" keys="$2"
  kubectl -n "${COPY_FROM}" get secret "${name}" -o json \
    | jq --arg namespace "${NAMESPACE}" --argjson keys "${keys}" \
        '{apiVersion, kind, type, data: (.data | with_entries(select(.key as $key | $keys | length == 0 or index($key)))), metadata: {name: .metadata.name, namespace: $namespace}}' \
    | kubectl apply -f - >/dev/null
}

require_tools minikube kubectl helm jq docker node

say "a database of its own: ${DATABASE}"
npm run --silent db:up >/dev/null
docker exec floor-postgres psql -U postgres -qc "drop database if exists ${DATABASE} with (force)" -c "create database ${DATABASE}"

say "building the image inside minikube: floor:${VERSION}"
minikube -p "${PROFILE}" image build -t "floor:${VERSION}" --build-opt "build-arg=FLOOR_BUILD_SHA=$(git rev-parse HEAD)" . >"${LOGS}/build.log" 2>&1 \
  || { tail -30 "${LOGS}/build.log"; fail "the image did not build"; }

say "namespace ${NAMESPACE}, its secrets and its pipelines"
create_namespace
copy_secret ghcr-pull-secret '[]'
in_namespace patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr-pull-secret"}]}' >/dev/null
in_namespace create secret generic floor-api --from-literal=serviceToken="${TOKEN}" --from-literal=visitTokenSecret="walk-chart-secret" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
in_namespace create configmap floor-pipelines --from-file=scripts/pipelines/ --dry-run=client -o yaml | kubectl apply -f - >/dev/null

say "installing the chart"
helm -n "${NAMESPACE}" upgrade --install floor deploy/chart \
  --set version="${VERSION}" --set image.repository=floor \
  --set "imagePullSecrets[0].name=ghcr-pull-secret" \
  --set api.baseUrl="http://floor-api.${NAMESPACE}.svc.cluster.local:8080" --set api.existingSecret=floor-api \
  --set postgres.host=host.minikube.internal --set postgres.port=5433 --set postgres.database="${DATABASE}" \
  --set postgres.user=postgres --set postgres.password=floor \
  --set subsystem.enabled=true --set pipelines.existingConfigMap=floor-pipelines \
  --set-string clusterAgent.modelSecretKeys="${MODEL_SECRET_KEYS//,/\\,}" \
  --wait --timeout 5m >"${LOGS}/helm.log" 2>&1 \
  || { tail -20 "${LOGS}/helm.log"; what_went_wrong; fail "the chart did not install"; }
in_namespace get deployments,jobs,networkpolicy

say "giving the agents the model's credential"
copy_secret agent-secrets '["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]'

say "reaching the api through a port-forward on :${PORT}"
# Not through in_namespace: a function in the background is a shell of its own, and stopping that shell leaves kubectl running.
kubectl -n "${NAMESPACE}" port-forward service/floor-api "${PORT}:8080" >"${LOGS}/port-forward.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  curl -sf "${BASE}/readyz" >/dev/null && break
  sleep 0.2
done
curl -sf "${BASE}/readyz" >/dev/null || { what_went_wrong; fail "the api did not answer"; }
api "${BASE}/version" | jq -c .

say "what the seed job ran"
api "${BASE}/migrations" | jq -r '.items[] | "\(.id)\t\(.body.sha256)"'
api "${BASE}/assembly-lines/walk-note" >/dev/null || { what_went_wrong; fail "the seed job did not put the line walk-note"; }

say "starting a run"
RUN="$(api -X POST "${BASE}/assembly-lines/walk-note/start" -d '{"repo":"github.com/re-cinq/floor","startItems":{"topic":{"kind":"value","ref":"a floor installed by its chart","by":"walk-chart.sh"}}}' | jq -r .run.id)"
echo "run ${RUN}"

say "watching the run over the live channel"
FLOOR_SERVICE_TOKEN="${TOKEN}" node scripts/watch-run.mjs "${BASE}" "${RUN}" >"${LOGS}/live.log" 2>&1 &
WATCHER=$!

say "waiting for the agent, up to ${WAIT_SECONDS}s"
OUTCOME=null
SELECTED=""
for _ in $(seq 1 "$((WAIT_SECONDS / 5))"); do
  OUTCOME="$(api "${BASE}/assembly-runs/${RUN}" | jq -r .run.outcome)"
  [ "${OUTCOME}" != "null" ] && break
  NOW="$(in_namespace get pods -l agents.re-cinq.com/component=job --no-headers 2>/dev/null | awk '{printf "%s %s  ", $1, $3}' || true)"
  if [ -n "${NOW}" ] && [ "${NOW}" != "${SELECTED}" ]; then echo "  pods the policy selects: ${NOW}"; SELECTED="${NOW}"; fi
  sleep 5
done

say "the run"
api "${BASE}/assembly-runs/${RUN}" | jq '{outcome: .run.outcome, reason: .run.reason, bag}'
NOTE="$(api "${BASE}/assembly-runs/${RUN}" | jq -r '.bag.note.ref // empty')"
if [ -n "${NOTE}" ]; then api "${BASE}/blobs/${NOTE}"; echo; fi

say "the run as a viewer saw it, live"
WATCHED=0
wait "${WATCHER}" || WATCHED=$?
awk '{ if ($2 == "record" && $4 == "turn") turns++; else print } END { if (turns) print "       and " turns " turns, each as it was said" }' "${LOGS}/live.log"

if [ "${OUTCOME}" != "success" ] || [ -z "${NOTE}" ]; then
  what_went_wrong
  fail "outcome ${OUTCOME}, note ${NOTE:-missing}"
fi
[ "${WATCHED}" = 0 ] || { what_went_wrong; fail "the viewer was not closed with 1000"; }
grep -q ' run_settled ' "${LOGS}/live.log" || fail "the viewer was not sent the run's settling"
[ -n "${SELECTED}" ] || fail "the agent's pod did not carry the label the network policy selects"

say "walked: ${RUN} settled as success, in a floor its chart installed"
