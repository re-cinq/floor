# @re-cinq/floor-contracts

The floor's wire, as types: what its HTTP routes and its live socket take and answer. It has no runtime and no dependencies, so installing it adds declarations and no code.

## Where this fits

One declaration has three readers. [`@floor/store`](../store/README.md) instantiates the row shapes and re-exports the rest, `apps/api` annotates its handlers with them, and [`@re-cinq/floor-client`](../client/README.md) reads them back off the wire.

Before this package the same shapes were written out four times, and the copies had drifted apart. One omitted a git need's `access`, another omitted a visit's `iteration`, and a field the route renames on its way out was named nowhere at all.

It depends on nothing, which is what lets a published SDK depend on it. See [the map](../../README.md).

## The one rule

**A type belongs here only if its declaration is already valid JSON-after-parse.** No `Date`, no `Buffer`.

This is the rule to get wrong. A row the store keeps has `finishedAt: Date`. The same row on the wire has `finishedAt: string`, because hapi wrote it out. So a row is declared once, parameterised on its timestamp type, and read two ways:

```ts
export interface RunFields<Time> { /* … */ finishedAt: Time | null }

export type RunView = RunFields<string>;   // here: what a client reads
export type Run = RunFields<Date>;         // in @floor/store: what Postgres holds
```

Never name a wire type `Run` or `Visit`. The `*View` suffix is the distinction, in the identifier where it cannot be missed. `apps/api/src/wire-contract.test-d.ts` holds the two sides together at compile time. It asserts that jsonifying each row gives exactly its view, including every frame of the live socket.

## What is here

- `definitions.ts` has the bodies a floor is given: `LineBody`, `StationBody`, `AgentDefinitionBody`, `ScheduleBody`, and what they are made of (`Item`, `Report`, `NeedSpec`, `ProduceSpec`, `AgentSettings`, `ModelPrice`).
- `wire.ts` has what exists only on the wire: `Problem` (RFC 9457), `VisitBrief` and its `BriefNeed`, `BriefSettings` and `BriefConversation`, `ClaimedEvent`, `BlobRef`, `PutResult`, `GitCredential`, `MigrationBody`.
- `views.ts` has the row shapes and their views, and `LiveFrame`.

## Two names worth knowing

`BriefConversation` says `sessionRef` and the store's `DispatchConversation` says `visitId`. They are the same field. The route renames it on the way out. Until this package existed, that rename was a translation in a handler with a name on neither side.

`unsupported` is the one frame with no `seq`. It is the floor's answer to anything a viewer says, and a client that says nothing never sees it.
