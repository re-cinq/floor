#!/usr/bin/env bash
# Asks a built image whether each app can resolve every workspace package, rather than trusting
# the Dockerfile to list them. The list drifted twice, and the second time the cluster agent
# crash-looped in a real cluster on `@re-cinq/floor-client`, which the image did not hold.
#
#   bash scripts/check-image.sh floor:local
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
IMAGE="${1:?usage: check-image.sh <image>}"
APPS=(apps/api apps/cluster-agent)

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

# lore-converter is a developer's tool and deliberately not shipped; the rest must all be there.
names="$(npm pkg get name --workspaces | jq -r 'to_entries[] | select(.key | test("lore-converter") | not) | .value' | grep -v '^@floor/api$' | grep -v '^@floor/cluster-agent$')"
[ -n "${names}" ] || fail "no workspace packages found to check"

for app in "${APPS[@]}"; do
  say "${app} resolves every workspace package it might import"
  for name in ${names}; do
    docker run --rm --entrypoint node "${IMAGE}" \
      -e "require('module').createRequire('/app/${app}/dist/index.js').resolve('${name}')" \
      >/dev/null 2>&1 || fail "${app} cannot resolve ${name} inside ${IMAGE}"
    echo "  ${name}"
  done
done

say "the pipeline tool is in the image and runs"
# Asked for nothing, the tool prints its usage and exits non-zero, which pipefail would call a failure.
usage="$(docker run --rm --entrypoint node "${IMAGE}" packages/pipeline/dist/cli.js 2>&1 || true)"
grep -q "floor-pipeline" <<<"${usage}" \
  || fail "packages/pipeline/dist/cli.js did not print its usage inside ${IMAGE}"

say "the store's migrations are in the image"
docker run --rm --entrypoint sh "${IMAGE}" -c 'ls packages/store/migrations/*.sql' >/dev/null \
  || fail "the store's migrations are missing from ${IMAGE}"

printf '\n== the image holds every package both apps need\n'
