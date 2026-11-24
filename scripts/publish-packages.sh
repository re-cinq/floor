#!/usr/bin/env bash
# Stages the packages in the directories given as arguments on npm, run from the repository root
# by publish.yml. A staged version is not installable until a maintainer approves it with 2FA
# (docs/releasing.md). VERSION is the release's version; NPM_BOOTSTRAP_TOKEN is only used by a
# package with no version on the registry yet, every other one stages through OIDC.
#
#   VERSION=1.2.3 NPM_BOOTSTRAP_TOKEN= scripts/publish-packages.sh packages/graph packages/client
set -eo pipefail

for package in "$@"; do
  name="$(node -p "require('./${package}/package.json').name")"
  # A run started again after it failed half way publishes what is left.
  if npm view "${name}@${VERSION}" version >/dev/null 2>&1; then
    echo "${name}@${VERSION} is on the registry already" | tee -a publish.log
    continue
  fi
  if npm view "${name}" version >/dev/null 2>&1; then
    (cd "${package}" && npm stage publish --access public --provenance --ignore-scripts) 2>&1 | tee -a publish.log
    continue
  fi
  if [ -z "${NPM_BOOTSTRAP_TOKEN}" ]; then
    echo "::error::${name} has never been published. Add the NPM_BOOTSTRAP_TOKEN secret and run Publish again on this tag (docs/releasing.md)."
    exit 1
  fi
  echo "${name} is new on the registry: its first version is staged with the bootstrap token" | tee -a publish.log
  (cd "${package}" && NODE_AUTH_TOKEN="${NPM_BOOTSTRAP_TOKEN}" npm stage publish --access public --provenance --ignore-scripts) 2>&1 | tee -a publish.log
done
