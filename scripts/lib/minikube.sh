# Shared by the minikube scripts: where things are, and the one kubeconfig they all act through.
# Sourced, not run.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAMESPACE="${FLOOR_AGENTS_NAMESPACE:-floor-agents}"
PROFILE="${MINIKUBE_PROFILE:-minikube}"
ENV_FILE="${FLOOR_ENV_FILE:-${ROOT}/.env.local}"
KUBECONFIG_FILE="${ROOT}/.floor-kubeconfig-minikube"
PROCESS_ENV_FILE="${ROOT}/.floor-agents.env"

log() { echo "[floor] $*"; }
fail() { echo "[floor] ERROR: $*" >&2; exit 1; }

require_tools() {
  local tool
  for tool in "$@"; do
    command -v "${tool}" >/dev/null 2>&1 || fail "${tool} not found"
  done
}

load_env_file() {
  [ -f "${ENV_FILE}" ] || return 0
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
}

start_cluster() {
  minikube status -p "${PROFILE}" >/dev/null 2>&1 && return 0
  log "minikube is not running, starting it"
  minikube start -p "${PROFILE}" || fail "minikube start failed"
}

# Everything these scripts do, and the cluster agent afterwards, would otherwise follow whatever
# context kubectl happens to be on, which on a working laptop is routinely a real cluster. A
# kubeconfig holding the minikube context alone makes that mistake impossible. Written through a
# temp file: if KUBECONFIG already points at the target, a plain redirect would empty it before
# kubectl reads it.
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
}

create_namespace() {
  kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl label namespace "${NAMESPACE}" "agents.re-cinq.com/system=true" --overwrite >/dev/null
}

# One line of the file the floor's processes read; no secret is ever written there.
set_process_env() {
  local name="$1" value="$2" kept
  kept="$(mktemp)"
  grep -v "^${name}=" "${PROCESS_ENV_FILE}" 2>/dev/null >"${kept}" || true
  echo "${name}=${value}" >>"${kept}"
  mv "${kept}" "${PROCESS_ENV_FILE}"
}

# Waits for the cluster agent to take away what the walk's visits left. It learns that a visit has
# ended from an event, a moment after the run settles, so a walk that stops it at once leaves pods.
wait_for_cleanup() {
  local left=""
  for _ in $(seq 1 30); do
    left="$(kubectl -n "${FLOOR_AGENTS_NAMESPACE}" get agents --no-headers 2>/dev/null | awk '/^floor-/ {print $1}' || true)"
    [ -z "${left}" ] && break
    sleep 5
  done
  if [ -n "${left}" ]; then printf 'still in the cluster:\n%s\n' "${left}"; else echo "nothing of the walk is left in the cluster"; fi
}
