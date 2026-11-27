#!/usr/bin/env bash
# Lints and renders deploy/chart against a minimal values file for each of: both apps, API only,
# and cluster agent only. Also asserts every install-time refusal actually fires, and
# that no rendered ConfigMap or values.yaml default carries a password/token/secret.
set -euo pipefail

cd "$(dirname "$0")/.."
CHART="deploy/chart"

# Never touch a real cluster, even read-only: agent-secrets.yaml's `lookup` call would otherwise
# reach whatever kube context happens to be current. An unreachable KUBECONFIG makes `lookup`
# fail closed and return empty, exactly like offline `helm template` already documents.
export KUBECONFIG="/dev/null"

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

for scenario in both api-only cluster-agent-only seeded; do
  say "helm template: ${scenario}"
  helm template floor "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml" >/dev/null
  helm lint "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml"
done

say "helm template: subsystem enabled"
subsystem_render="$(helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" --set subsystem.enabled=true)"

say "the subsystem defaults to v0.21.3, controller and agent image alike"
grep -qF 'image: ghcr.io/re-cinq/ai-agent-controller:v0.21.3' <<<"${subsystem_render}" \
  || fail "the controller image is not ai-agent-controller:v0.21.3"
grep -qF 'value: ghcr.io/re-cinq/ai-agent:v0.21.3' <<<"${subsystem_render}" \
  || fail "AGENT_IMAGE is not ai-agent:v0.21.3"

say "the api asks the provider it was given for git credentials"
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" \
  --set api.gitCredentialUrl=http://lore/git-credentials \
  | grep -qF 'value: "http://lore/git-credentials"' \
  || fail "api.gitCredentialUrl did not reach the api"

say "the api asks nobody for git credentials by default"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" | grep -qF FLOOR_GIT_CREDENTIAL_URL; then
  fail "FLOOR_GIT_CREDENTIAL_URL is set though no provider was given"
fi

say "the api presents its own token to the provider, from a Secret"
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" \
  --set api.gitCredentialUrl=http://lore/git-credentials \
  | grep -A4 'name: FLOOR_GIT_CREDENTIAL_TOKEN' | grep -qF secretKeyRef \
  || fail "FLOOR_GIT_CREDENTIAL_TOKEN is not a secretKeyRef though a provider was given"

say "the api carries no git credential token without a provider"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" | grep -qF FLOOR_GIT_CREDENTIAL_TOKEN; then
  fail "FLOOR_GIT_CREDENTIAL_TOKEN is set though no provider was given"
fi

say "the api reads its gateway keys from the Secret it was given, and never from a value"
gateway_render="$(helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" --set api.gatewayKeysSecret.name=floor-gateway-keys)"
grep -A4 'name: FLOOR_GATEWAY_SIGNING_KEY' <<<"${gateway_render}" | grep -qF 'key: gatewaySigningKey' \
  || fail "FLOOR_GATEWAY_SIGNING_KEY is not read from the gateway keys Secret"
grep -A5 'name: FLOOR_GATEWAY_RETIRED_KEYS' <<<"${gateway_render}" | grep -qF 'optional: true' \
  || fail "FLOOR_GATEWAY_RETIRED_KEYS is not an optional key of the gateway keys Secret"

say "the api carries no gateway keys by default"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" | grep -qF FLOOR_GATEWAY_; then
  fail "a gateway key variable is set though no Secret was given"
fi

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

assert_refusal "empty version" \
  "version is required" \
  --set version="" --set postgres.existingSecret=s --set postgres.secretKey=k \
  --set api.enabled=false --set clusterAgent.enabled=false

assert_refusal "api.enabled without api.existingSecret" \
  "api.existingSecret is required" \
  --set version=t --set postgres.existingSecret=s --set postgres.secretKey=k \
  --set api.enabled=true --set api.baseUrl=http://floor --set clusterAgent.enabled=false

say "a published chart runs the image of its own app version"
packaged="$(mktemp -d)"
helm package "${CHART}" --version 9.9.9 --app-version 9.9.9 --destination "${packaged}" >/dev/null
helm template floor "${packaged}/floor-9.9.9.tgz" -f "${CHART}/ci/values-both.yaml" --set version="" \
  | grep -qF 'image: ghcr.io/re-cinq/floor:9.9.9' \
  || fail "a chart packaged with --app-version 9.9.9 did not run that image tag"
rm -rf "${packaged}"

say "agent pods reach the api of their own release, and are reached by nothing"
policy="$(helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" -s templates/agent-networkpolicy.yaml)"
grep -qF 'agents.re-cinq.com/component: job' <<<"${policy}" || fail "the policy does not select agent pods"
grep -qF 'ingress: []' <<<"${policy}" || fail "the policy lets something reach an agent pod"
grep -qF 'app.kubernetes.io/component: api' <<<"${policy}" || fail "the policy does not let an agent pod reach the api"
grep -qF '169.254.0.0/16' <<<"${policy}" || fail "the policy lets an agent pod reach the metadata endpoint"

say "agent pods reach the node's own DNS cache, where the cluster runs one"
grep -qF '169.254.20.10/32' <<<"${policy}" || fail "the policy does not let an agent pod reach NodeLocal DNSCache"

say "agent pods reach what the operator lists"
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" -s templates/agent-networkpolicy.yaml \
  --set 'agentNetworkPolicy.extraEgress[0].to[0].namespaceSelector.matchLabels.kubernetes\.io/metadata\.name=lore' \
  --set 'agentNetworkPolicy.extraEgress[0].ports[0].port=8443' \
  | grep -qF 'kubernetes.io/metadata.name: lore' \
  || fail "agentNetworkPolicy.extraEgress did not reach the policy"

say "a release with no api names no api in the policy"
if helm template floor "${CHART}" -f "${CHART}/ci/values-cluster-agent-only.yaml" -s templates/agent-networkpolicy.yaml \
     | grep -qF 'app.kubernetes.io/component: api'; then
  fail "the policy names an api this release does not run"
fi

say "no policy where no agent runs, nor when it is turned off"
for without in "-f ${CHART}/ci/values-api-only.yaml" "-f ${CHART}/ci/values-both.yaml --set agentNetworkPolicy.enabled=false"; do
  # shellcheck disable=SC2086
  if helm template floor "${CHART}" ${without} | grep -qF 'kind: NetworkPolicy'; then
    fail "a NetworkPolicy rendered with: ${without}"
  fi
done

say "no seed job by default"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" | grep -qF pipeline-seed; then
  fail "a seed job rendered though pipelines.existingConfigMap is empty"
fi

say "the seed job waits for the api, when given a ConfigMap"
helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" | grep -qF -- '--wait-ready' \
  || fail "the seed job is absent, or does not wait for the api"

say "no password/token/secret value in values.yaml defaults"
if grep -inE '^\s*(password|token|secret)\s*:\s*[^"'"'"' ]' "${CHART}/values.yaml" \
     | grep -viE '(password|token|secret)\s*:\s*("")?\s*$'; then
  fail "values.yaml sets a default value for a password/token/secret-looking key"
fi

say "scheduling: global.nodeSelector and tolerations reach every pod template"
scheduled="$(helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" --set subsystem.enabled=true \
  --set global.nodeSelector.pool=management \
  --set 'global.tolerations[0].key=pool' --set 'global.tolerations[0].operator=Exists')"
pod_templates="$(grep -cE '^kind: (Deployment|Job)$' <<<"${scheduled}")"
selectors="$(grep -cE '^ +pool: management$' <<<"${scheduled}")"
tolerations="$(grep -cE '^ +- key: pool$' <<<"${scheduled}")"
[ "${pod_templates}" -ge 5 ] || fail "expected api, cluster agent, controller and both Jobs, found ${pod_templates} pod templates"
[ "${selectors}" -eq "${pod_templates}" ] || fail "${selectors} of ${pod_templates} pod templates carry global.nodeSelector"
[ "${tolerations}" -eq "${pod_templates}" ] || fail "${tolerations} of ${pod_templates} pod templates carry global.tolerations"

say "scheduling: a component's own nodeSelector wins over global"
own="$(helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" -s templates/api-deployment.yaml \
  --set global.nodeSelector.pool=management --set api.nodeSelector.pool=edge)"
grep -qF 'pool: edge' <<<"${own}" || fail "api.nodeSelector did not reach the api"
if grep -qF 'pool: management' <<<"${own}"; then fail "global.nodeSelector overrode api.nodeSelector"; fi

say "scheduling: nothing is rendered when nothing is set"
if helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" --set subsystem.enabled=true | grep -qE 'nodeSelector|tolerations'; then
  fail "a scheduling rule rendered though none was given"
fi

say "resources: api, cluster agent and both Jobs carry requests and limits"
for template in api-deployment cluster-agent-deployment migration-job pipeline-seed-job; do
  rendered="$(helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" -s "templates/${template}.yaml")"
  grep -qF 'requests:' <<<"${rendered}" && grep -qF 'limits:' <<<"${rendered}" || fail "${template} has no resource requests and limits"
done
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" -s templates/api-deployment.yaml \
  --set api.resources.limits.memory=3Gi | grep -qF 'memory: 3Gi' || fail "api.resources did not reach the api"

say "service accounts: api and Jobs mount no token, the cluster agent keeps its own"
for template_account in api-deployment:floor-api migration-job:floor-hooks pipeline-seed-job:floor-hooks; do
  template="${template_account%%:*}"
  account="${template_account##*:}"
  helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" -s "templates/${template}.yaml" \
    | grep -qF "serviceAccountName: ${account}" || fail "${template} does not run as ${account}"
done
for account_template in api-serviceaccount hooks-serviceaccount; do
  helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" -s "templates/${account_template}.yaml" \
    | grep -qF 'automountServiceAccountToken: false' || fail "${account_template} mounts a token"
done
helm template floor "${CHART}" -f "${CHART}/ci/values-seeded.yaml" -s templates/cluster-agent-deployment.yaml \
  | grep -qF 'serviceAccountName: floor-cluster-agent' || fail "the cluster agent lost its ServiceAccount"
if helm template floor "${CHART}" -f "${CHART}/ci/values-cluster-agent-only.yaml" | grep -qE '^  name: floor-api$'; then
  fail "an api ServiceAccount rendered with no api"
fi

say "disruption budget: only for an api with more than one replica"
helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" --set api.replicas=2 \
  | grep -qF 'kind: PodDisruptionBudget' || fail "no PodDisruptionBudget for two api replicas"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" --set api.replicas=1 | grep -qF 'kind: PodDisruptionBudget'; then
  fail "a PodDisruptionBudget rendered for a single api replica"
fi

say "network policy for the floor's own pods: off by default"
if helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" | grep -qF -- '-api-ingress'; then
  fail "the api ingress policy rendered by default"
fi

say "network policy for the floor's own pods: the cluster agent, agent pods and listed namespaces reach the api"
ingress="$(helm template floor "${CHART}" -f "${CHART}/ci/values-both.yaml" -s templates/api-networkpolicy.yaml \
  --set apiNetworkPolicy.enabled=true \
  --set 'apiNetworkPolicy.allowedNamespaces[0]=lore' --set 'apiNetworkPolicy.allowedNamespaces[1]=traefik')"
grep -qF 'app.kubernetes.io/component: api' <<<"${ingress}" || fail "the api policy does not select the api"
grep -qF 'app.kubernetes.io/component: cluster-agent' <<<"${ingress}" || fail "the api policy does not admit the cluster agent"
grep -qF 'agents.re-cinq.com/component: job' <<<"${ingress}" || fail "the api policy does not admit agent pods"
grep -qF 'kubernetes.io/metadata.name: lore' <<<"${ingress}" || fail "the api policy does not admit a listed namespace"
grep -qF 'kubernetes.io/metadata.name: traefik' <<<"${ingress}" || fail "the api policy does not admit the second listed namespace"
grep -qF 'port: 8080' <<<"${ingress}" || fail "the api policy does not name the api port"

say "the api policy cannot lock the Jobs out of the api"
grep -qF 'app.kubernetes.io/component: pipeline-seed' <<<"${ingress}" || fail "the api policy does not admit the seed Job"

say "no password in any rendered ConfigMap"
for scenario in both api-only cluster-agent-only seeded; do
  rendered="$(helm template floor "${CHART}" -f "${CHART}/ci/values-${scenario}.yaml" --set subsystem.enabled=true)"
  configmaps="$(awk '/^kind: ConfigMap$/{found=1} /^---/{found=0} found' <<<"${rendered}")"
  if [ -n "${configmaps}" ] && grep -qiE 'password|secret' <<<"${configmaps}"; then
    fail "a rendered ConfigMap (${scenario}) names a password or secret"
  fi
done

say "all checks passed"
