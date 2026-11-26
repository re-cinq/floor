---
title: Client SDK
description: Start and watch assembly runs with a service token, or report a result for one visit.
---

{{intro}}

Follow [Start and watch your first run in TypeScript](/floor/tutorials/hello-world-client/) for an executable example.

## Start a run

Install {{package}} with `npm install @re-cinq/floor-client`. The example uses the pipeline from [Build a Hello World station](/floor/tutorials/hello-world-station/). Pass the Floor URL and a token created with `serviceToken(rawToken)` as the access argument. Keep the service token in the service that owns it.

{{start.mts}}

## Watch one run

Pass the returned run ID to this function. To resume your own consumer after a restart, save the last processed sequence and pass it as `after` to `runs.watch`.

{{watch-run.mts}}

## Watch all runs

Use the service-wide feed when a dashboard needs to track multiple runs. Supply a refresh callback and abort the signal when the dashboard closes.

{{watch-floor.mts}}

## Report a visit

An executor receives its visit ID and token from Floor. Construct its access object with the Floor URL, that ID, and `visitToken(rawVisitToken)`. When writing a station with the [Station SDK](/floor/sdk/station/), the SDK posts the handler’s report for you.

{{visit.mts}}

If the executor calls `visit.gitCredential(repo)`, handle its three outcomes explicitly. `credential` carries the credentials, `unconfigured` means the Floor has no credential provider, and `ungranted` means this visit lacks write access to that repository.

[View the example tests]({{test}}). For TypeScript projects we recommend adding [our ESLint rules](https://www.npmjs.com/package/@re-cinq/eslint-plugin-re-lint) as a development dependency.

## API reference
