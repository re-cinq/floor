---
title: Build a Hello World station
description: Run a Node.js worker that turns the name Ada into a greeting and inspect the result on Floor.
---

You’ll build a worker that takes a name from a visit and puts a greeting in the run’s [bag](/floor/concepts/bag/). You need Node.js 22.18 or newer, Bash, curl, jq, and a running Floor. For a local server, follow [Start Floor](/floor/tutorials/first-run/#1-start-floor).

## Install the SDK and CLI

In a new directory, install both packages. Set the following environment variables in **both terminals**. These values are for the local development server.

```sh
npm init -y
npm install @re-cinq/floor-station @re-cinq/floor-pipeline
export FLOOR_API_URL=http://localhost:8180
export FLOOR_SERVICE_TOKEN=floor-dev-token
```

## Define the pipeline

Save this as `hello.yaml`. The line sends a visit to the station named `hello`. Its handler receives the `name` input and returns the `greeting` output with outcome `success`.

<!-- generated:example:code/hello/hello.yaml -->

````yaml title="hello/hello.yaml"
stations:
  hello:
    kind: service
    outcomes: [success, failed]
    needs: [{ name: name, kind: value }]
    produces: [{ name: greeting, kind: value }]
line:
  id: hello-world
  entry: greet
  exit: done
  fail: broken
  args:
    name: { kind: value, subject: true }
  nodes:
    - { id: greet, station: hello }
    - { id: done }
    - { id: broken }
  edges:
    - { from: greet, to: done, on: success }
    - { from: greet, to: broken, on: failed }
````

<!-- /generated -->

## Start the worker

Save this as `worker.mts` in the same directory.

<!-- generated:example:code/hello/worker.mts -->

````ts title="hello/worker.mts"
import { defineStation, type Handle } from "@re-cinq/floor-station";

// Each visit supplies the name from the pipeline. Floor puts the returned greeting in the run’s bag.
const greet: Handle = async ({ needs }) => ({
  outcome: "success",
  produced: { greeting: `Hello, ${needs.name}!` },
});

// Start polling for visits assigned to the station named "hello" in the pipeline.
export const station = defineStation("hello", greet);
````

<!-- /generated -->

In the first terminal, import the pipeline and start the worker. Leave it running while you start a visit.

```sh
npx floor-pipeline import hello.yaml
node worker.mts
```

## Run it and read the greeting

In the second terminal, save the following as `run.sh` and run `bash run.sh`. It starts a run with the name Ada and waits for the worker’s report.

<!-- generated:example:code/hello/run.sh -->

````bash title="hello/run.sh"
set -euo pipefail

floor() {
  curl -fsS -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
    -H 'Content-Type: application/json' "$@"
}

RUN=$(floor "$FLOOR_API_URL/assembly-lines/hello-world/start" \
  -d '{"startItems":{"name":{"kind":"value","ref":"Ada","by":"tutorial"}}}' | jq -er '.run.id')

for attempt in $(seq 1 30); do
  result=$(floor "$FLOOR_API_URL/assembly-runs/$RUN") || exit 1
  if jq -e '.run.outcome != null' >/dev/null <<<"$result"; then
    jq -er 'select(.run.outcome == "success") | .bag.greeting.ref' <<<"$result"
    exit $?
  fi
  sleep 1
done
echo "Run $RUN is still pending. Check that the hello worker is running." >&2
exit 1
````

<!-- /generated -->

Expected output:

```text
Hello, Ada!
```

Press Ctrl+C in the worker terminal when you’re finished. See the [Station SDK reference](/floor/sdk/station/) for the handler types and file tools, or [Write a custom station](/floor/tutorials/custom-station/#3-the-same-in-plain-http) for the underlying HTTP requests.
