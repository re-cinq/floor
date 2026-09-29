#!/usr/bin/env bash
# Walks one run through a real agent pod on a Gemini model, with your gcloud login and no API key.
# A relay on this machine asks Vertex AI as you; the pod holds a key made for this walk, which
# opens the relay and nothing else, and is taken back when the walk ends. Your login never leaves
# this machine. Needs `gcloud auth application-default login` and `npm run minikube-setup`.
#
#   GOOGLE_CLOUD_PROJECT=<project with Vertex AI> bash scripts/walk-gemini.sh
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

cd "${ROOT}"
[ -f "${PROCESS_ENV_FILE}" ] || fail "${PROCESS_ENV_FILE} is missing: run 'npm run minikube-setup' first"
require_tools gcloud kubectl jq openssl
PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
[ -n "${PROJECT}" ] || fail "name the project: GOOGLE_CLOUD_PROJECT=<project with Vertex AI>"

RELAY_PORT="${FLOOR_GEMINI_RELAY_PORT:-8282}"
RELAY_KEY="relay-$(openssl rand -hex 16)"
SECRET_KEY=GOOGLE_API_KEY
MODEL="${FLOOR_WALK_MODEL:-gemini-3.1-pro-preview}"
KUBECONFIG="$(sed -n 's/^FLOOR_KUBECONFIG=//p' "${PROCESS_ENV_FILE}")"
export KUBECONFIG
RELAY_LOG="$(mktemp)"

# The key is a merge patch on stdin, so it is never on a command line.
hold_key() {
  RELAY_KEY="${RELAY_KEY}" jq -n --arg key "${SECRET_KEY}" '{stringData: {($key): env.RELAY_KEY}}' \
    | kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge --patch-file /dev/stdin >/dev/null
}

take_back() {
  kill "${RELAY:-0}" 2>/dev/null || true
  kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge -p "{\"data\":{\"${SECRET_KEY}\":null}}" >/dev/null 2>&1 || true
  echo
  echo "== what the relay was asked"
  cat "${RELAY_LOG}"
}
trap take_back EXIT

echo "== starting the relay on :${RELAY_PORT}, asking Vertex AI as you, in ${PROJECT}"
PORT="${RELAY_PORT}" GOOGLE_CLOUD_PROJECT="${PROJECT}" GEMINI_RELAY_KEY="${RELAY_KEY}" node scripts/stations/gemini-relay.mjs >"${RELAY_LOG}" 2>&1 &
RELAY=$!
for _ in $(seq 1 50); do
  grep -q "listening" "${RELAY_LOG}" && break
  sleep 0.2
done
grep -q "listening" "${RELAY_LOG}" || fail "the relay did not start: $(cat "${RELAY_LOG}")"
hold_key

FLOOR_WALK_MODEL="${MODEL}" FLOOR_WALK_CONFIG="$(jq -cn --arg key "${SECRET_KEY}" --arg relay "http://host.minikube.internal:${RELAY_PORT}" '{
  model_secret_key: $key,
  env: {GOOGLE_GENAI_USE_VERTEXAI: "true", GOOGLE_VERTEX_BASE_URL: $relay, GEMINI_CLI_TRUST_WORKSPACE: "true"}}')" \
  bash scripts/walk-agent.sh
