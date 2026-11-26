---
title: Import and export a pipeline
description: Save a Hello World pipeline from Floor and verify that importing it again creates no new versions.
---

Start with the `hello.yaml` from [Build a Hello World station](/floor/tutorials/hello-world-station/#define-the-pipeline) and a running Floor. In the directory containing that file, install the CLI with `npm install @re-cinq/floor-pipeline`. Set `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` as in the [station tutorial](/floor/tutorials/hello-world-station/#install-the-sdk-and-cli). You can leave the worker stopped during this exercise.

## Import the definitions

```sh
npx floor-pipeline import hello.yaml
```

On a fresh Floor, the CLI prints `changed` for `stations/hello` and `assembly-lines/hello-world`. If you already imported this file in the station tutorial, both entries say `as it was`.

## Export what Floor stored

```sh
npx floor-pipeline export hello-world --out hello-export.yaml
```

Open `hello-export.yaml`. Look for the line ID `hello-world`, its `hello` station, the `name` input and the `greeting` output. Floor reconstructs this file from stored definitions, so formatting and comments can differ from your original YAML.

## Verify the round trip

```sh
npx floor-pipeline import hello-export.yaml
```

Expected output:

```text
hello-export.yaml:
  stations/hello: as it was
  assembly-lines/hello-world: as it was
```

Both definitions already have the exported content. To inspect the same result in a program, see [Import from TypeScript](/floor/sdk/pipeline/#import-from-typescript).
