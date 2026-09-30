# Releasing

A release is a version of five things, published together: the image, the wire contracts, the
client, the station SDK and the pipeline tool. Pushing a `vX.Y.Z` tag is the whole act.
No commit bumps a version, and nothing waits for a hand afterwards.

## What a release publishes

| | where | as |
|---|---|---|
| the image | `ghcr.io/re-cinq/floor` | `1.2.3` and `1.2` |
| the wire contracts | npm, `@re-cinq/floor-contracts` | `1.2.3` |
| the client | npm, `@re-cinq/floor-client` | `1.2.3` |
| the station SDK | npm, `@re-cinq/floor-station` | `1.2.3` |
| the pipeline tool | npm, `@re-cinq/floor-pipeline` | `1.2.3` |
| the deploy | the cluster the repository names | the image `1.2.3` |

A commit to `main` publishes no version. It publishes the image under its short SHA and
`latest`, and deploys the SHA: `.github/workflows/build.yml`.

## Cutting one

```
git fetch origin && git tag v1.2.3 origin/main && git push origin v1.2.3
```

That starts `.github/workflows/publish.yml`:

1. **The tag is checked.** It is `v`, three numbers and nothing more, and its commit is on
   `main`. Any other tag is refused.
2. **The gates run again**, against the tagged commit: every job of `ci.yml`. A tag points at
   whatever its author chose, so a green `main` says nothing about it.
3. **The image is built and pushed**, and **the packages are published to npm**, installable
   at once.
4. **The image is deployed**, once the repository names a cluster.
5. **The GitHub Release is written**, with generated notes, last: it never names a version
   that failed to publish.

A version published to npm is there for good, so the brake is in front of the tag: the tagged
commit must be on `main`, and `main` takes a pull request.

## The version is the tag

The four packages carry a placeholder version on `main`. `scripts/release-version.sh v1.2.3`
stamps `1.2.3` into them, and into the ranges they ask of one another, just before they are built, in the workflow's checkout, and commits
nothing. `scripts/check-pack-list.mjs` then reads what each tarball would hold: the entry point
and the license are there, and no test and no source map is.

## Before the first release, once, by hand

npm publishes from this repository without a token: Trusted Publishing trades the workflow's
OIDC token for a credential that lives for minutes. A trusted publisher is registered on a
package, and a package that was never published is not there to register it on. So the first
version of each is published by a person. A package added later gets the same, alone.

```
git switch --detach <the commit to release>
scripts/release-version.sh v0.1.0
npm ci --ignore-scripts
npm run build -w @re-cinq/floor-contracts -w @re-cinq/floor-client -w @re-cinq/floor-station -w @re-cinq/floor-pipeline
node scripts/check-pack-list.mjs packages/contracts packages/client packages/station packages/pipeline
npm login
(cd packages/contracts && npm publish --access public --ignore-scripts)
(cd packages/client    && npm publish --access public --ignore-scripts)
(cd packages/station   && npm publish --access public --ignore-scripts)
(cd packages/pipeline  && npm publish --access public --ignore-scripts)
git restore packages package-lock.json
```

Then, for each of the four packages, on npmjs.com: Settings, Trusted Publisher, GitHub Actions.

| field | value |
|---|---|
| organization | `re-cinq` |
| repository | `floor` |
| workflow filename | `publish.yml` |

Then push the tag for the same version. The workflow finds all four packages on the registry
already, leaves them, and publishes the image.

**The publisher is registered against the workflow's file name.** Renaming or moving
`publish.yml` breaks publishing until it is registered again.

## When a release fails half way

Run `Publish` again by hand, from the Actions tab, **on the tag** and not on a branch.
What reached a registry before the failure is left as it is: the image is pushed again under
the same tags, and a package whose version is on npm already is skipped.

## What `latest` is

The image `latest` is what `main` last built. A release does not move it: a release of an older
commit would move it backwards. On npm, `latest` is the last version published.
