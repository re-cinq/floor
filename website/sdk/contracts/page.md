---
title: Floor contracts
description: The TypeScript types for Floor definitions, visit payloads, run views, and live frames.
---

{{intro}}

Install {{package}} with `npm install --save-dev @re-cinq/floor-contracts` to use these types directly. Use `import type` so the import disappears from the emitted JavaScript. For TypeScript projects, we recommend [Floor’s ESLint rules](https://www.npmjs.com/package/@re-cinq/eslint-plugin-re-lint) as a development dependency.

## Build a visit report

The [Brief](/floor/sdk/contracts/#brief) carries resolved input values. The [Report](/floor/sdk/contracts/#report) names an outcome and any values produced. This example uses the inputs and outputs from the [Hello World station](/floor/tutorials/hello-world-station/). An executor fetching a brief over HTTP receives the richer [VisitBrief](/floor/sdk/contracts/#visitbrief).

{{report.mts}}

## Handle a live notification

[FloorFrame](/floor/sdk/contracts/#floorframe) describes updates across runs. A single-run watch uses [LiveFrame](/floor/sdk/contracts/#liveframe), which includes visit and settlement events. See [Watch all runs](/floor/sdk/client/#watch-all-runs) to connect the floor-wide stream.

{{frame.mts}}

[View the example tests]({{test}}).

## Type reference
