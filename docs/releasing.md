# Releasing

A release is a version of nine things, published together: the image, the chart, the wire
contracts, the assembly-line rules, the graph view, the client, the station SDK, the pipeline tool and the studio. Pushing a `vX.Y.Z` tag is the whole act.
No commit bumps a version, and nothing waits for a hand afterwards.

## What a release publishes

| | where | as |
|---|---|---|
| the image | `ghcr.io/re-cinq/floor`, for `linux/amd64` and `linux/arm64` | `1.2.3` and `1.2` |
| the chart | `oci://ghcr.io/re-cinq/charts/floor` | `1.2.3`, running the image `1.2.3` |
| the wire contracts | npm, `@re-cinq/floor-contracts` | `1.2.3` |
| the assembly-line rules | npm, `@re-cinq/floor-assembly-lines` | `1.2.3` |
| the graph view | npm, `@re-cinq/floor-graph` | `1.2.3` |
| the client | npm, `@re-cinq/floor-client` | `1.2.3` |
| the station SDK | npm, `@re-cinq/floor-station` | `1.2.3` |
| the pipeline tool | npm, `@re-cinq/floor-pipeline` | `1.2.3` |
| the studio | npm, `@re-cinq/floor-studio` | `1.2.3` |
| the deploy | nothing, by itself: re:cinq's cluster runs the `version` pinned in `deploy/clusters/internal-cluster.values.yaml` | bump it in a pull request, Argo CD syncs the merge |

A commit to `main` publishes no version. It publishes the image under its short SHA and
`latest`: `.github/workflows/build.yml`. Whether the cluster runs it is a separate merge, see
[How re:cinq deploys it](../deploy/chart/README.md#how-recinq-deploys-it).

## Cutting one

```
git fetch origin && git tag v1.2.3 origin/main && git push origin v1.2.3
```

That starts `.github/workflows/publish.yml`:

1. **The tag is checked.** It is `v`, three numbers and nothing more, and its commit is on
   `main`. Any other tag is refused.
2. **The gates run again**, against the tagged commit: every job of `ci.yml`. A tag points at
   whatever its author chose, so a green `main` says nothing about it.
3. **The image is built and pushed**, **the chart is packaged and pushed**, and **the packages
   are staged on npm**. A staged version is not installable until a maintainer approves it:
   see [Approving the npm versions](#approving-the-npm-versions).
4. **The leftover push deploy runs**, `deploy.yml`, into the cluster the repository variables
   still name, the decommissioned `n8n-cluster`. It is not how the release reaches re:cinq's
   floor: that is a pull request setting `version: 1.2.3` in
   `deploy/clusters/internal-cluster.values.yaml`, which Argo CD syncs once merged.
5. **The GitHub Release is written**, with generated notes, last: it never names a version
   that failed to publish.

A version published to npm is there for good, so the brake is in front of the tag: the tagged
commit must be on `main`, and `main` takes a pull request.

## The version is the tag

The npm packages carry a placeholder version on `main`. `scripts/release-version.sh --list` is the one list of them, in dependency order; `publish.yml` builds, checks and publishes from it, and `ci.yml` runs the same steps with `npm publish --dry-run` on every pull request, so a package that cannot be published fails before a tag exists. `scripts/release-version.sh v1.2.3`
stamps `1.2.3` into them, and into the ranges they ask of one another, just before they are built, in the workflow's checkout, and commits
nothing. The chart carries a placeholder too, and no `appVersion`: `helm package --version 1.2.3
--app-version 1.2.3` stamps both, and the `appVersion` is the image tag an install of the chart runs
when it names none. A checkout has no `appVersion`, so an install from one must set `version`. `scripts/check-pack-list.mjs` then reads what each tarball would hold: every file its `exports` and `bin` name
and the license are there, and no test and no source map is.

## A package's first version

npm stages from this repository through Trusted Publishing: the workflow trades its OIDC
token for a credential that lives for minutes. A trusted publisher is registered on a package,
and a package that was never published is not there to register it on. So `publish.yml`
stages a package with no version on the registry yet with a token instead, and every other
package the usual way, in `scripts/publish-packages.sh`, which `scripts/publish-packages.test.mjs` covers. Nothing is published by hand.

1. On npmjs.com, create a granular access token with read and write on the `@re-cinq` scope
   and a short expiry. npm caps a writing token at 90 days.
2. Add it to the repository as the Actions secret `NPM_BOOTSTRAP_TOKEN`.
3. Push the tag. The workflow stages the new package with the token, and the rest through
   OIDC. Without the secret, the run stops at the new package and names it.
4. Approve the staged versions (below).
5. On npmjs.com, open the new package: Settings, Trusted Publisher, GitHub Actions.

| field | value |
|---|---|
| organization | `re-cinq` |
| repository | `floor` |
| workflow filename | `publish.yml` |
| allowed actions | `npm stage publish`, the default since 2026-09-03 |

   npm drops a configuration that has not published within two days of being saved, and the
   token stage of step 3 does not count. Save it when the next release is due, or delete and
   save it again before that release.
6. Delete the `NPM_BOOTSTRAP_TOKEN` secret and revoke the token. The next release of that
   package goes through OIDC.

## Approving the npm versions

`publish.yml` stages, and does not publish: a direct publish with a token is refused with
`EOTP`, since it would need a one-time password the workflow does not have. A staged version
is on the registry, with its provenance, but is not installable until a maintainer approves it
with 2FA, one package at a time: on npmjs.com, the package's Versions tab, Approve; or
`npm stage list`, then `npm stage approve <id>`. The run's summary lists what it staged.

**The publisher is registered against the workflow's file name.** Renaming or moving
`publish.yml` breaks publishing until it is registered again.

## When a release fails half way

Run `Publish` again by hand, from the Actions tab, **on the tag** and not on a branch.
What reached a registry before the failure is left as it is: the image is pushed again under
the same tags, and a package whose version is on npm already is skipped. A version that is
staged but not yet approved is not on npm yet: approve it, or reject it, before running again.

## What `latest` is

The image `latest` is what `main` last built. A release does not move it: a release of an older
commit would move it backwards. On npm, `latest` is the last version published.
