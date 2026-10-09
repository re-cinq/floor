#!/usr/bin/env bash
# npm run minikube-setup
#
# Installs the ai-agent-subsystem into a laptop minikube, in the floor's own namespace, so a
# host-run floor and cluster agent can run real agent pods. Safe to run again.
#
# The agents' Claude credential is `npm run minikube-claude-auth`'s job, which this runs; see that
# script for where the credential comes from. The subsystem's images are private, so this needs
# GHCR_USER and GHCR_TOKEN in .env.local (a GitHub token with read:packages), or
# FLOOR_COPY_SECRETS_FROM=<namespace> to take the pull secret another install already has.
#
# It never touches another namespace, and applies the cluster-wide CRDs only when they are missing
# (FLOOR_APPLY_CRDS=1 forces it): another install on the cluster reads the same CRDs.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

MANIFESTS="${ROOT}/deploy/agent-subsystem"
COPY_FROM="${FLOOR_COPY_SECRETS_FROM:-}"
FLOOR_PORT="${PORT:-8180}"

# The pair the subsystem released as v0.11.10; they move together, never one without the other.
# Check what a digest really is before trusting a label: the subsystem's own deploy/ at a
# tag pins the release before it (at v0.11.6, v0.11.3).
#   docker image inspect <image> --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
CONTROLLER_IMAGE="${FLOOR_CONTROLLER_IMAGE:-ghcr.io/re-cinq/ai-agent-controller@sha256:5e25e5614d6b3657adda52cafec128580fbed8395f2becdfa72fcfe5642bf64b}"
AGENT_IMAGE="${FLOOR_AGENT_IMAGE:-ghcr.io/re-cinq/ai-agent@sha256:85d93d7ed98be111ce89e33dc5fde2a89dd9ef6ec47d8f25ace78172b36e9d0a}"

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
  elif kubectl -n "${NAMESPACE}" get secret ghcr-pull-secret >/dev/null 2>&1; then
    log "ghcr-pull-secret kept as it is"
    return
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

main() {
  require_tools minikube kubectl jq npm
  load_env_file
  start_cluster
  pin_context
  log "Pinned to the '${PROFILE}' context"
  create_namespace
  log "Namespace ${NAMESPACE} ready"

  (cd "${ROOT}" && npm run --silent minikube-claude-auth)

  write_pull_secret
  bind_pull_secret
  apply_crds
  install_controller

  set_process_env FLOOR_KUBECONFIG "${KUBECONFIG_FILE}"
  set_process_env FLOOR_AGENTS_NAMESPACE "${NAMESPACE}"
  set_process_env FLOOR_BASE_URL "http://host.minikube.internal:${FLOOR_PORT}"
  log "Wrote ${PROCESS_ENV_FILE}"

  log "The agent subsystem is ready in ${NAMESPACE}"
  log "  watch runs:  kubectl --kubeconfig ${KUBECONFIG_FILE} -n ${NAMESPACE} get agents -w"
  log "  new token:   npm run minikube-claude-auth"
  log "  remove it:   kubectl --kubeconfig ${KUBECONFIG_FILE} delete namespace ${NAMESPACE}"
}

main "$@"
