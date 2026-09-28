#!/usr/bin/env bash
# npm run minikube-claude-auth
#
# Gives the agents in minikube a Claude credential. Safe to run again, which is also how a token
# that expired is replaced. The credential comes from the first of these that has one:
#
#   1. ANTHROPIC_API_KEY, then CLAUDE_CODE_OAUTH_TOKEN, in the environment or in .env.local.
#   2. FLOOR_COPY_SECRETS_FROM=<namespace>: that namespace's agent-secrets, for a cluster another
#      install (lore's, say) already gave one.
#   3. Your own Claude subscription: it runs `claude setup-token`, asks you to paste what that
#      prints, and keeps it in .env.local for next time.
#
# An API key wins over a token when both are there: it is the deliberate choice.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

COPY_FROM="${FLOOR_COPY_SECRETS_FROM:-}"
KEYS=(ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN)

key_in_environment() {
  local key
  for key in "${KEYS[@]}"; do
    if [ -n "${!key:-}" ]; then echo "${key}"; return; fi
  done
}

key_in_namespace() {
  [ -n "${COPY_FROM}" ] || return 0
  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json \
    | jq -r --args '.data as $held | first($ARGS.positional[] | select($held[.] != null)) // empty' "${KEYS[@]}"
}

# Kept out of the terminal's scrollback and out of any command line: read without echo, written by
# a shell builtin into a file only you can read.
ask_for_subscription_token() {
  [ -t 0 ] || fail "no Claude credential, and no terminal to ask for one: run this from a terminal, or put CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in ${ENV_FILE}, or set FLOOR_COPY_SECRETS_FROM"
  require_tools claude

  log "No Claude credential yet. Running 'claude setup-token': finish the login in your browser."
  claude setup-token || log "'claude setup-token' did not finish; paste a token you already have"

  local token
  read -r -s -p "[floor] Paste the token from above: " token
  echo
  [ -n "${token}" ] || fail "no token given"

  save_to_env_file CLAUDE_CODE_OAUTH_TOKEN "${token}"
  CLAUDE_CODE_OAUTH_TOKEN="${token}"
}

save_to_env_file() {
  local name="$1" value="$2" kept
  kept="$(mktemp)"
  chmod 600 "${kept}"
  grep -v "^${name}=" "${ENV_FILE}" 2>/dev/null >"${kept}" || true
  printf '%s=%s\n' "${name}" "${value}" >>"${kept}"
  mv "${kept}" "${ENV_FILE}"
  log "Saved ${name} to ${ENV_FILE}"
}

# The secret as a merge patch on stdin: its value never appears in a command line.
credential_patch() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    export "${key?}"
    KEY="${key}" jq -n '{stringData: {(env.KEY): env[env.KEY]}}'
    return
  fi
  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json | jq --arg key "${key}" '{data: {($key): .data[$key]}}'
}

# agent-secrets has two writers: this script, and the cluster agent, which adds a key per visit.
# So it is created only if missing, and then merged into, never replaced. Of the two credentials
# only the chosen one stays: the agent uses whichever it finds, and a stale one is a trap.
write_credential() {
  local key="$1" other
  kubectl -n "${NAMESPACE}" get secret agent-secrets >/dev/null 2>&1 \
    || kubectl -n "${NAMESPACE}" create secret generic agent-secrets >/dev/null
  credential_patch "${key}" | kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge --patch-file /dev/stdin >/dev/null

  for other in "${KEYS[@]}"; do
    [ "${other}" = "${key}" ] && continue
    kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge -p "{\"data\":{\"${other}\":null}}" >/dev/null
  done
}

main() {
  require_tools minikube kubectl jq
  load_env_file
  start_cluster
  pin_context
  create_namespace

  local key
  key="$(key_in_environment)"
  [ -n "${key}" ] || key="$(key_in_namespace)"
  if [ -z "${key}" ]; then
    ask_for_subscription_token
    key=CLAUDE_CODE_OAUTH_TOKEN
  fi

  write_credential "${key}"
  # The pod's reference to this key is not optional: the cluster agent must ask for the very name
  # that is in the secret, or every pod waits in CreateContainerConfigError.
  set_process_env FLOOR_MODEL_SECRET_KEYS "claude=${key}"

  log "Agents in ${NAMESPACE} authenticate with ${key}"
}

main "$@"
