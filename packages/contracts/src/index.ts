// eslint-disable-next-line re-lint/max-comment-lines -- Published as the contracts reference introduction.
/**
 * Floor contracts describe the data exchanged by its [HTTP API](/floor/reference/http-api/)
 * and live connections. Use them to type your own integrations, from a visit report to a
 * notification about an [assembly run](/floor/concepts/assembly-run/). The package exports
 * TypeScript types only. The [Client SDK](/floor/sdk/client/) provides the HTTP and socket operations.
 *
 * @packageDocumentation
 */
export type {
  AgentDefinitionBody,
  AgentSettings,
  Brief,
  Item,
  ItemKind,
  LineArgSpec,
  LineBody,
  LineEdge,
  LineNode,
  LineNodeReport,
  LineStart,
  ModelPrice,
  NeedSpec,
  ProduceSpec,
  Report,
  ScheduleBody,
  StationBody,
  StationKind,
  WhenValue,
} from "./definitions.js";

export type {
  AgentPresence,
  AgentRecipes,
  BlobRef,
  BriefConversation,
  BriefNeed,
  BriefSettings,
  ClaimedEvent,
  ClusterHolding,
  ClusterPresence,
  ClusterRegistration,
  ClusterVersions,
  DefinitionKind,
  ExecutorSettings,
  FileNeed,
  GitCredential,
  GitNeed,
  McpServerSettings,
  PodResources,
  PresenceState,
  MigrationBody,
  Problem,
  PutResult,
  SubsystemVersions,
  ValueNeed,
  VisitBrief,
} from "./wire.js";

export type {
  CostsRow,
  DefinitionRowFields,
  DefinitionRowView,
  FloorEventFields,
  FloorEventView,
  FloorFrame,
  LiveFrame,
  RecordKind,
  RunFields,
  RunView,
  StationRunRecordFields,
  StationRunRecordView,
  VisitFields,
  VisitView,
} from "./views.js";
