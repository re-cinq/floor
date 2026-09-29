#!/usr/bin/env bash
# The GitHub Release's tag is the version. The packages carry a placeholder on main; this stamps
# the tag's version into them just before they are built, so a release is one act and no commit
# ever bumps a version. It prints the version, and with --check that is all it does:
# publish.yml's first job runs it so that a bad tag fails in seconds.
#
#   scripts/release-version.sh --check v1.2.3     prints 1.2.3
#   scripts/release-version.sh v1.2.3             stamps 1.2.3 into the published packages
set -euo pipefail

PUBLISHED=(@re-cinq/floor-contracts @re-cinq/floor-client @re-cinq/floor-station @re-cinq/floor-pipeline)

check_only=false
if [ "${1:-}" = "--check" ]; then
  check_only=true
  shift
fi
tag="${1:?usage: release-version.sh [--check] <tag>}"

if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "'${tag}' is not a release tag: a release is vMAJOR.MINOR.PATCH, and a prerelease is not published" >&2
  exit 1
fi
version="${tag#v}"

if [ "${check_only}" = false ]; then
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  for package in "${PUBLISHED[@]}"; do
    npm version "${version}" --workspace "${package}" --no-git-tag-version --allow-same-version >/dev/null
  done
fi

echo "${version}"
