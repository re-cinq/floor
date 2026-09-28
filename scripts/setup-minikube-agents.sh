#!/usr/bin/env bash
# Installs the ai-agent-subsystem into a laptop minikube, in the floor's own namespace, so a host-run
# floor and cluster agent can run real agent pods. Safe to run again.
#
# The agent's model credential comes from one of, in this order:
#   1. ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env.local (FLOOR_ENV_FILE points elsewhere).
#      The token is your own Claude subscription: `claude setup-token` prints one.
#   2. FLOOR_COPY_SECRETS_FROM=<namespace>: copied from that namespace's agent-secrets and
#      ghcr-pull-secret, for a cluster another install (lore's, say) already set up.
#
# It never touches another namespace, and applies the cluster-wide CRDs only when they are missing
# (FLOOR_APPLY_CRDS=1 forces it): another install on the cluster reads the same CRDs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFESTS="${ROOT}/deploy/agent-subsystem"
NAMESPACE="${FLOOR_AGENTS_NAMESPACE:-floor-agents}"
PROFILE="${MINIKUBE_PROFILE:-minikube}"
ENV_FILE="${FLOOR_ENV_FILE:-${ROOT}/.env.local}"
COPY_FROM="${FLOOR_COPY_SECRETS_FROM:-}"
FLOOR_PORT="${PORT:-8080}"
KUBECONFIG_FILE="${ROOT}/.floor-kubeconfig-minikube"
PROCESS_ENV_FILE="${ROOT}/.floor-agents.env"

# The pair the subsystem released as v0.11.6; they move together, never one without the other.
CONTROLLER_IMAGE="${FLOOR_CONTROLLER_IMAGE:-ghcr.io/re-cinq/ai-agent-controller@sha256:7730775126e43856f0101ff17d3f0e5c4f784dcc1aece9c464401913349e9c8a}"
AGENT_IMAGE="${FLOOR_AGENT_IMAGE:-ghcr.io/re-cinq/ai-agent@sha256:56ce7fa583033915bbfdb42862079658a52ba3387373edfb6a29d5083092bd43}"

log() { echo "[floor] $*"; }
fail() { echo "[floor] ERROR: $*" >&2; exit 1; }

require_tools() {
  local tool
  for tool in minikube kubectl jq; do
    command -v "${tool}" >/dev/null 2>&1 || fail "${tool} not found"
  done
}

load_env_file() {
  [ -f "${ENV_FILE}" ] || return 0
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
  log "Read ${ENV_FILE}"
}

start_cluster() {
  minikube status -p "${PROFILE}" >/dev/null 2>&1 && return 0
  log "minikube is not running, starting it"
  minikube start -p "${PROFILE}" || fail "minikube start failed"
}

# Everything below, and the cluster agent afterwards, would otherwise follow whatever context kubectl
# happens to be on, which on a working laptop is routinely a real cluster. A kubeconfig holding the
# minikube context alone makes that mistake impossible. Written through a temp file: if KUBECONFIG
# already points at the target, a plain redirect would empty it before kubectl reads it.
pin_context() {
  case ":${KUBECONFIG:-}:" in
    *":${KUBECONFIG_FILE}:"*) unset KUBECONFIG ;;
  esac

  local flattened
  flattened="$(mktemp)"
  if ! kubectl config view --minify --flatten --context="${PROFILE}" >"${flattened}"; then
    rm -f "${flattened}"
    fail "no kubeconfig context named '${PROFILE}'; see 'kubectl config get-contexts'"
  fi
  mv "${flattened}" "${KUBECONFIG_FILE}"
  chmod 600 "${KUBECONFIG_FILE}"
  export KUBECONFIG="${KUBECONFIG_FILE}"
  log "Pinned to the '${PROFILE}' context"
}

create_namespace() {
  kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl label namespace "${NAMESPACE}" "agents.re-cinq.com/system=true" --overwrite >/dev/null
  log "Namespace ${NAMESPACE} ready"
}

# Which key the agent's credential goes under. An API key wins when both are set: it is the
# deliberate choice. The same name must reach the pod's secret reference, which is not optional,
# so a mismatch is not a fallback, it is every pod stuck in CreateContainerConfigError.
credential_key() {
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then echo ANTHROPIC_API_KEY; return; fi
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then echo CLAUDE_CODE_OAUTH_TOKEN; return; fi
  [ -n "${COPY_FROM}" ] || return 0

  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json \
    | jq -r '.data | if has("ANTHROPIC_API_KEY") then "ANTHROPIC_API_KEY" elif has("CLAUDE_CODE_OAUTH_TOKEN") then "CLAUDE_CODE_OAUTH_TOKEN" else empty end'
}

# The secret's value, base64, as a merge patch on stdin: it never appears in a command line.
credential_patch() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    KEY="${key}" jq -n '{stringData: {(env.KEY): env[env.KEY]}}'
    return
  fi
  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json | jq --arg key "${key}" '{data: {($key): .data[$key]}}'
}

# agent-secrets has two writers: this script, and the cluster agent, which adds a key per visit.
# So the secret is created only if missing, and then merged into, never replaced.
write_agent_secrets() {
  local key="$1"
  kubectl -n "${NAMESPACE}" get secret agent-secrets >/dev/null 2>&1 \
    || kubectl -n "${NAMESPACE}" create secret generic agent-secrets >/dev/null
  credential_patch "${key}" | kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge --patch-file /dev/stdin >/dev/null
  log "agent-secrets holds ${key}"
}

# The subsystem's images are private packages.
write_pull_secret() {
  if [ -n "${GHCR_USER:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
    GHCR_AUTH="$(printf '%s:%s' "${GHCR_USER}" "${GHCR_TOKEN}" | base64 -w0)" \
      jq -n '{auths: {"ghcr.io": {auth: env.GHCR_AUTH}}}' \
      | kubectl -n "${NAMESPACE}" create secret generic ghcr-pull-secret --type=kubernetes.io/dockerconfigjson \
          --from-file=.dockerconfigjson=/dev/stdin --dry-run=client -o yaml \
      | kubectl apply -f - >/dev/null
  elif [ -n "${COPY_FROM}" ]; then
    kubectl -n "${COPY_FROM}" get secret ghcr-pull-secret -o json \
      | jq --arg namespace "${NAMESPACE}" '{apiVersion, kind, type, data, metadata: {name: .metadata.name, namespace: $namespace}}' \
      | kubectl apply -f - >/dev/null
  else
    fail "no way to pull the subsystem's images: set GHCR_USER and GHCR_TOKEN in ${ENV_FILE} (a GitHub token with read:packages), or FLOOR_COPY_SECRETS_FROM"
  fi
  log "ghcr-pull-secret ready"
}

# Run pods are created under the namespace's default service account, which a fresh namespace
# gets a moment after it exists.
bind_pull_secret() {
  local attempt
  for attempt in $(seq 1 30); do
    kubectl -n "${NAMESPACE}" get serviceaccount default >/dev/null 2>&1 && break
    sleep 1
  done
  kubectl -n "${NAMESPACE}" patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr-pull-secret"}]}' >/dev/null
}

apply_crds() {
  if [ "${FLOOR_APPLY_CRDS:-}" != "1" ] && kubectl get crd agents.agents.re-cinq.com >/dev/null 2>&1; then
    log "CRDs already on the cluster, left as they are (FLOOR_APPLY_CRDS=1 to apply the floor's)"
    return
  fi
  kubectl apply -f "${MANIFESTS}/crds/" >/dev/null
  log "CRDs applied"
}

install_controller() {
  sed -e "s|__NAMESPACE__|${NAMESPACE}|g" -e "s|__CONTROLLER_IMAGE__|${CONTROLLER_IMAGE}|g" -e "s|__AGENT_IMAGE__|${AGENT_IMAGE}|g" \
    "${MANIFESTS}/controller.yaml" | kubectl apply -f - >/dev/null
  kubectl -n "${NAMESPACE}" rollout status deployment/agent-controller --timeout=5m >/dev/null \
    || fail "the controller did not come up; see 'kubectl -n ${NAMESPACE} get pods'"
  log "Controller running"
}

# What the floor and the cluster agent need to know about this install. No secret is written here.
write_process_env() {
  local key="$1"
  cat >"${PROCESS_ENV_FILE}" <<ENV
FLOOR_KUBECONFIG=${KUBECONFIG_FILE}
FLOOR_AGENTS_NAMESPACE=${NAMESPACE}
FLOOR_MODEL_SECRET_KEYS=claude=${key}
FLOOR_BASE_URL=http://host.minikube.internal:${FLOOR_PORT}
ENV
  log "Wrote ${PROCESS_ENV_FILE}"
}

main() {
  require_tools
  load_env_file
  start_cluster
  pin_context
  create_namespace

  local key
  key="$(credential_key)"
  [ -n "${key}" ] || fail "no model credential: put CLAUDE_CODE_OAUTH_TOKEN (run 'claude setup-token') or ANTHROPIC_API_KEY in ${ENV_FILE}, or set FLOOR_COPY_SECRETS_FROM"

  write_agent_secrets "${key}"
  write_pull_secret
  bind_pull_secret
  apply_crds
  install_controller
  write_process_env "${key}"

  log "The agent subsystem is ready in ${NAMESPACE}, with ${key} as the agent's credential"
  log "  watch runs:  kubectl --kubeconfig ${KUBECONFIG_FILE} -n ${NAMESPACE} get agents -w"
  log "  remove it:   kubectl --kubeconfig ${KUBECONFIG_FILE} delete namespace ${NAMESPACE}"
}

main "$@"
