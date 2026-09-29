#!/usr/bin/env bash
# npm run minikube-gemini-auth
#
# Gives the agents in minikube a Gemini credential, beside whatever they hold for Claude. Safe to
# run again, which is also how a key is replaced. The key comes from the first of these that has
# one:
#
#   1. GEMINI_API_KEY, in the environment or in .env.local.
#   2. FLOOR_COPY_SECRETS_FROM=<namespace>: that namespace's agent-secrets, for a cluster another
#      install (lore's, say) already gave one.
#   3. You: it asks you to paste a key, and keeps it in .env.local for next time.
#
# It is an API key and nothing wider. Your gcloud login, the application-default credentials, is
# not used: it is a file, a pod is given variables, and what it opens is your whole account, in
# reach of an agent that runs commands.
set -euo pipefail

# shellcheck source=lib/minikube.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/minikube.sh"

COPY_FROM="${FLOOR_COPY_SECRETS_FROM:-}"
KEY=GEMINI_API_KEY

held_in_namespace() {
  [ -n "${COPY_FROM}" ] || return 1
  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json | jq -e --arg key "${KEY}" '.data[$key] != null' >/dev/null
}

# Kept out of the terminal's scrollback and out of any command line: read without echo, written by
# a shell builtin into a file only you can read.
ask_for_key() {
  [ -t 0 ] || fail "no Gemini key, and no terminal to ask for one: run this from a terminal, or put ${KEY} in ${ENV_FILE}, or set FLOOR_COPY_SECRETS_FROM"

  local given kept
  read -r -s -p "[floor] Paste a Gemini API key (aistudio.google.com/apikey): " given
  echo
  [ -n "${given}" ] || fail "no key given"

  kept="$(mktemp)"
  chmod 600 "${kept}"
  grep -v "^${KEY}=" "${ENV_FILE}" 2>/dev/null >"${kept}" || true
  printf '%s=%s\n' "${KEY}" "${given}" >>"${kept}"
  mv "${kept}" "${ENV_FILE}"
  log "Saved ${KEY} to ${ENV_FILE}"
  GEMINI_API_KEY="${given}"
}

# The secret as a merge patch on stdin: its value never appears in a command line.
credential_patch() {
  if [ -n "${GEMINI_API_KEY:-}" ]; then
    export GEMINI_API_KEY
    jq -n '{stringData: {GEMINI_API_KEY: env.GEMINI_API_KEY}}'
    return
  fi
  kubectl -n "${COPY_FROM}" get secret agent-secrets -o json | jq --arg key "${KEY}" '{data: {($key): .data[$key]}}'
}

# agent-secrets has other writers: the Claude script, and the cluster agent, which adds a key per
# visit. So it is created only if missing, and then merged into, never replaced.
write_credential() {
  kubectl -n "${NAMESPACE}" get secret agent-secrets >/dev/null 2>&1 \
    || kubectl -n "${NAMESPACE}" create secret generic agent-secrets >/dev/null
  credential_patch | kubectl -n "${NAMESPACE}" patch secret agent-secrets --type merge --patch-file /dev/stdin >/dev/null
}

main() {
  require_tools minikube kubectl jq
  load_env_file
  start_cluster
  pin_context
  create_namespace

  [ -n "${GEMINI_API_KEY:-}" ] || held_in_namespace || ask_for_key
  write_credential

  log "Agents in ${NAMESPACE} running a gemini model authenticate with ${KEY}"
}

main "$@"
