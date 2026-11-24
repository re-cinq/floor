#!/usr/bin/env bash
# The pushed tag is the version. The packages carry a placeholder on main; this stamps
# the tag's version into them just before they are built, so a release is one act and no commit
# ever bumps a version. It prints the version, and with --check that is all it does:
# publish.yml's first job runs it so that a bad tag fails in seconds.
#
#   scripts/release-version.sh --check v1.2.3     prints 1.2.3
#   scripts/release-version.sh v1.2.3             stamps 1.2.3 into the published packages
#   scripts/release-version.sh --list             prints the published package directories, in dependency order
set -euo pipefail

# The one list of what a release publishes, in dependency order. publish.yml builds, checks and publishes from it.
PUBLISHED=(packages/contracts packages/assembly-lines packages/graph packages/client packages/station packages/pipeline packages/studio)

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${PUBLISHED[@]}"
  exit 0
fi

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
  # They are released together, so each one asks for exactly the others' version, not "*".
  for package in "${PUBLISHED[@]}"; do
    for dependency in $(npm pkg get dependencies --workspace "${package}" | node -e '
      const found = Object.values(JSON.parse(require("fs").readFileSync(0, "utf8")))[0] ?? {};
      console.log(Object.keys(found).filter((name) => name.startsWith("@re-cinq/floor-")).join(" "))'); do
      npm pkg set "dependencies.${dependency}=${version}" --workspace "${package}" >/dev/null
    done
  done
fi

echo "${version}"
