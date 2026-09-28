#!/usr/bin/env bash
# npm start
#
# The floor on this machine, reloading on save: Postgres in its container, the API and the cluster
# agent as host processes. A save recompiles what changed and restarts what depends on it. Ctrl-C
# stops the host processes and leaves Postgres and minikube up, so the next start is fast.
#
#   PORT=8180              the API's port; not 8080, which is lore's floor on the same machine
#   FLOOR_AGENTS=0         no cluster agent, and no minikube: for work that never reaches an agent
#   FLOOR_SETUP=1          run the minikube setup again, even though it has run before
#
# Tokens come from .env.local when it sets them, and are fixed, well-known values when it does
# not: this is a laptop, and anything that can reach the port can read this file too.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
load_env_file

export PORT="${PORT:-8180}"
export FLOOR_SERVICE_TOKEN="${FLOOR_SERVICE_TOKEN:-floor-dev-token}"
export FLOOR_VISIT_TOKEN_SECRET="${FLOOR_VISIT_TOKEN_SECRET:-floor-dev-visit-secret}"
AGENTS="${FLOOR_AGENTS:-1}"

# Everything started below, stopped together, however this script ends.
trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

# Runs a command with each line of its output named, so six processes in one terminal stay readable.
named() {
  local name="$1"
  shift
  "$@" 2>&1 | sed -u "s/^/[${name}] /" &
}

watch_build() {
  named "$1" npx --no-install tsc --watch --preserveWatchOutput -p "$2/tsconfig.build.json"
}

# Restarts when its own build changes, or the build of a package it is made of.
watch_run() {
  local name="$1" app="$2"
  named "${name}" node --watch-preserve-output \
    --watch-path="${app}/dist" --watch-path=packages/store/dist --watch-path=packages/assembly-lines/dist \
    "${app}/dist/index.js"
}

prepare_agents() {
  if [ ! -f "${PROCESS_ENV_FILE}" ] || [ "${FLOOR_SETUP:-}" = "1" ]; then
    PORT="${PORT}" bash "${ROOT}/scripts/setup-minikube-agents.sh"
  fi
  set -a
  # shellcheck disable=SC1090
  . "${PROCESS_ENV_FILE}"
  set +a
}

log "Postgres"
npm run --silent db:up >/dev/null

if [ "${AGENTS}" = "1" ]; then prepare_agents; fi
# Pods reach the floor on the host, at the port it has today, whatever the setup was run with.
export FLOOR_BASE_URL="http://host.minikube.internal:${PORT}"

log "Building once"
npm run --silent build

watch_build lines packages/assembly-lines
watch_build store packages/store
watch_build api-tsc apps/api
watch_run api apps/api

if [ "${AGENTS}" = "1" ]; then
  watch_build agent-tsc apps/cluster-agent
  FLOOR_API_URL="http://localhost:${PORT}" FLOOR_CLUSTER_AGENT_TOKEN="${FLOOR_SERVICE_TOKEN}" \
    FLOOR_HEALTH_PORT="$((PORT + 1))" FLOOR_CLAIM_MAX_IDLE_MS="${FLOOR_CLAIM_MAX_IDLE_MS:-5000}" \
    watch_run agent apps/cluster-agent
fi

log "The floor is at http://localhost:${PORT}, token ${FLOOR_SERVICE_TOKEN}. Ctrl-C stops it."
wait
