#!/usr/bin/env bash
# Lints and renders deploy/chart against a minimal values file for each of: both apps, API only,
# cluster agent only. Also asserts every install-time refusal actually fires, and that no rendered
# ConfigMap or values.yaml default carries a password/token/secret.
set -euo pipefail

cd "$(dirname "$0")/.."
CHART="deploy/chart"

# Never touch a real cluster, even read-only: agent-secrets.yaml's `lookup` call would otherwise
# reach whatever kube context happens to be current. An unreachable KUBECONFIG makes `lookup`
# fail closed and return empty, exactly like offline `helm template` already documents.
export KUBECONFIG="/dev/null"

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

for scenario in both api-only cluster-agent-only; do
  say "helm template: ${scenario}"
  helm template floor "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml" >/dev/null
  helm lint "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml"
done

say "helm template: subsystem enabled"
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" --set subsystem.enabled=true >/dev/null

assert_refusal() {
  local name="$1"
  local expected="$2"
  shift 2
  local out
  if out="$(helm template floor "${CHART}" "$@" 2>&1)"; then
    fail "${name}: expected a refusal, but helm template succeeded"
  fi
  grep -qF "${expected}" <<<"${out}" || fail "${name}: refusal fired, but without the expected message (${expected})
${out}"
  say "refused as expected: ${name}"
}

assert_refusal "postgres incomplete" \
  "postgres: set postgres.existingSecret" \
  --set version=t --set api.enabled=false --set clusterAgent.enabled=false

assert_refusal "api.enabled without api.baseUrl" \
  "api.baseUrl is required" \
  --set version=t --set postgres.existingSecret=s --set postgres.secretKey=k \
  --set api.enabled=true --set api.baseUrl="" --set clusterAgent.enabled=false

assert_refusal "clusterAgent.enabled without clusterAgent.floorUrl, api disabled" \
  "clusterAgent.floorUrl is required" \
  --set version=t --set postgres.existingSecret=s --set postgres.secretKey=k \
  --set api.enabled=false --set clusterAgent.enabled=true

assert_refusal "unsupported subsystem.version" \
  "subsystem.version" \
  --set version=t --set postgres.existingSecret=s --set postgres.secretKey=k \
  --set api.enabled=false --set clusterAgent.enabled=false \
  --set subsystem.enabled=true --set subsystem.version=v0.0.1

say "no password/token/secret value in values.yaml defaults"
if grep -inE '^\s*(password|token|secret)\s*:\s*[^"'"'"' ]' "${CHART}/values.yaml" \
     | grep -viE '(password|token|secret)\s*:\s*("")?\s*$'; then
  fail "values.yaml sets a default value for a password/token/secret-looking key"
fi

say "no password in any rendered ConfigMap"
for scenario in both api-only cluster-agent-only; do
  rendered="$(helm template floor "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml" --set subsystem.enabled=true)"
  configmaps="$(awk '/^kind: ConfigMap$/{found=1} /^---/{found=0} found' <<<"${rendered}")"
  if [ -n "${configmaps}" ] && grep -qiE 'password|secret' <<<"${configmaps}"; then
    fail "a rendered ConfigMap (${scenario}) names a password or secret"
  fi
done

say "all checks passed"
