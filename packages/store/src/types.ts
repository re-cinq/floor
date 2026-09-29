// The rows this store keeps: a row is not the wire, since `finishedAt` and `deadline` are a Date here and an ISO string once hapi has written them out. The wire's own shapes come from @re-cinq/floor-contracts, re-exported so `@floor/store` stays the one import the server reaches for.
import type { RunFields, VisitFields } from "@re-cinq/floor-contracts";

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
} from "@re-cinq/floor-contracts";

export type Run = RunFields<Date>;

export type Visit = VisitFields<Date>;
