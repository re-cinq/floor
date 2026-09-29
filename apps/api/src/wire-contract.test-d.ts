import { describe, expectTypeOf, it } from "vitest";
import type { Run, StationRunRecord, Visit } from "@floor/store";
import type { FloorEvent } from "@floor/store";
import type { FloorEventView, LiveFrame, RunView, StationRunRecordView, VisitView } from "@re-cinq/floor-contracts";
import type { Frame } from "./live/run-feed.js";

type Jsonified<Value> = Value extends Date
  ? string
  : Value extends (infer Element)[]
    ? Jsonified<Element>[]
    : Value extends object
      ? { [Named in keyof Value]: Jsonified<Value[Named]> }
      : Value;

describe("a row and the view a client reads of it", () => {
  it("agrees on a run, once its dates are the strings hapi writes", () => {
    expectTypeOf<Jsonified<Run>>().toEqualTypeOf<RunView>();
  });

  it("agrees on a visit", () => {
    expectTypeOf<Jsonified<Visit>>().toEqualTypeOf<VisitView>();
  });

  it("agrees on an event", () => {
    expectTypeOf<Jsonified<FloorEvent>>().toEqualTypeOf<FloorEventView>();
  });

  it("agrees on a record", () => {
    expectTypeOf<Jsonified<StationRunRecord>>().toEqualTypeOf<StationRunRecordView>();
  });

  it("agrees on every frame the live socket sends, which is what a relay reads", () => {
    expectTypeOf<Jsonified<Frame>>().toEqualTypeOf<LiveFrame>();
  });
});
