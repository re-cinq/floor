// eslint-disable-next-line re-lint/max-comment-lines -- Published as the introduction to the SDK.
/**
 * Use the Station SDK to run your own code as a [station](/floor/concepts/station/) in an
 * [assembly line](/floor/concepts/assembly-line/). When an [assembly run](/floor/concepts/assembly-run/)
 * reaches your station, the SDK claims the visit and gives your handler a brief containing its inputs.
 * Your handler returns an outcome and any values it produced. The SDK posts that report to Floor.
 *
 * @packageDocumentation
 */
export { defineStation } from "./station.js";
export type { Brief, Handle, ModelCall, Report, RunningStation, StationOptions, Tools } from "./types.js";
