// eslint-disable-next-line re-lint/max-comment-lines -- Published as the Assembly Lines SDK introduction.
/**
 * Use the Assembly Lines SDK to check an [assembly line](/floor/concepts/assembly-line/)
 * before importing it and to replay the routing decisions of an [assembly run](/floor/concepts/assembly-run/).
 * Its functions work on definitions and visits in memory. Use the [Pipeline SDK](/floor/sdk/pipeline/)
 * to read YAML or send definitions to Floor.
 *
 * @packageDocumentation
 */
export {
  endsRun,
  getNextTransition,
  isTerminalNode,
  personLastActedAt,
  selectEdge,
  visitsSinceHandRun,
  type WalkEdge,
  type WalkGraph,
  type NodeVisit,
  type Transition,
  type StationKind,
} from "./transition.js";

export { definitionHash } from "./definition-hash.js";
export { readAgentVerdict, requiredVerdict, type AgentVerdict } from "./agent-verdict.js";

export { Refusal, enforce } from "./refusal.js";
export { VisitAlreadyOpen } from "./visit-already-open.js";
export { validateLine, type KnownDefinitions } from "./line-validation.js";
export { gitArgNames } from "./line-args.js";
export { nodeStartedBy, requireNode, startEventName } from "./start-events.js";
export {
  BROKER_PARAMETER_NAMES,
  GIT_CREDENTIAL_PARAMETER,
  GIT_CREDENTIAL_URL_PARAMETER,
  RUN_PARAMETER_NAMES,
  WORKSPACE,
  declaredParameters,
  needPathOf,
  promptParameters,
  runParameters,
  type DeclaredParameter,
} from "./prompt-parameters.js";
export { downstreamOf } from "./line-graph.js";
export { EXEMPT_NEEDS, coverageContextOf, needCoverage, needMissesOf, type NeedContext, type NeedCoverage } from "./line-needs.js";
export { DISPATCH_EVENT, REPORTED_EVENT, RUN_SETTLED_EVENT } from "./event-names.js";
export { nodeEvents, type AnsweredBy, type CollectionLine, type NodeEvents, type OutcomeTarget, type Raised, type StartOrigin, type StartedBy } from "./node-events.js";
export { placeholderPattern } from "./placeholder-pattern.js";
export { placeholderNames, promptPlaceholders, type PlaceholderRow, type PlaceholderSource, type PlaceholderState, type PromptPlaceholderInput, type PromptPlaceholders } from "./prompt-placeholders.js";
export { FAN_STATIONS, fanLine } from "./fanout.fixtures.js";
