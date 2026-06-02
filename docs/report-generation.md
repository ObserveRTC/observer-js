# Design: report generation (deferred to a future `ClientSampleProcessor`)

> **Decision (current):** report generation has been **removed entirely from the Observer** — the
> `ObservedClient.report`/`ClientReport`, per-track reports, the `client-track-report` event, and
> `Reports.ts` are all gone. The Observer's job is to maintain live state and emit the event bus;
> it is **not** responsible for reports. Report generation will live only in a separate,
> standalone entity — the future **`ClientSampleProcessor`** (see
> [`ROADMAP.md` §2.1](./ROADMAP.md)) — which sits in front of / alongside the Observer.
>
> The rest of this document is retained as **design input** for that future processor: the
> critique of the old in-core approach, and the snapshot + collector ideas it should reuse.

## How the old (removed) approach worked

- `ObservedClient.report: ClientReport` was a fixed object, **initialized in the constructor** and
  **accumulated imperatively inside `ObservedClient.update()`**: byte/packet totals (summed from
  per-tick deltas), an `rttDistribution` and a `scoreDistribution` (hardcoded buckets), and an
  `issues` count map.
- Each track had a `report` (e.g. inbound `fractionLostDistribution`) accumulated in the track's
  `update()`.
- `client-track-report` is emitted **only when a track is removed**, carrying that track's final
  report.
- All of this is defined in `Reports.ts` (`ClientReport`, `TrackReport`, …).

## What's wrong with it

1. **Coupled to the hot path.** Report accumulation lives inside the per-sample update loop, so
   the core update is tied to one specific report format and pays the cost every tick — even for
   consumers who never read `report`.
2. **Hardcoded, opinionated aggregation.** RTT/score/fraction-lost bucket boundaries are baked in.
   Different consumers want different aggregations and can't change them without editing the core.
3. **Duplicated state / two sources of truth.** The report totals re-accumulate counters that the
   entities already track as live fields.
4. **Inconsistent lifecycle.** The client report is continuous, but a *track* report is only
   delivered on removal — there's no interim track report.
5. **One fixed schema, not extensible.** No way to emit a different report shape without changing
   the library.

## Proposed direction (recommended): snapshots + opt-in collectors

Split "maintain live state + emit events" (core's job) from "aggregate into a report" (a separate,
opt-in concern). Two pieces:

### a) Snapshots — a serializable view of current state

Each entity can produce a plain, immutable, serializable snapshot of its **current** metrics on
demand (no accumulation, no methods):

```ts
observer.createSnapshot();   // whole tree
call.createSnapshot();       // one call + its clients
client.createSnapshot();     // one client + its peer connections
```

Snapshots are derived from the live fields that already exist, so there's a single source of
truth and zero hot-path cost unless you ask. This is the same primitive as the roadmap's "per-tick
snapshot API" — a consumer can grab one on each `client-updated` / `call-updated` tick, or on its
own cadence, and hand it straight to a sink/store.

### b) Collectors — opt-in aggregation built on snapshots/events

Reporting (totals, distributions, rollups, time series) becomes a **collector**: an opt-in object
that subscribes to the bus and/or folds snapshots into whatever report shape the app wants. The
**current `ClientReport` is reborn as one provided collector** (`ClientReportCollector`) so nothing
is lost — it's just no longer baked into `ObservedClient`. Distribution bucketing becomes a small
composable helper (`bucketize(value, buckets)`) so apps define their own boundaries.

```ts
// illustrative — opt in only if you want it
const reports = new ClientReportCollector(observer, {
  rttBuckets: [50, 150, 300],
  scoreBuckets: [0, 1, 2, 3, 4, 5],
});
// reports.get(clientId) -> the same ClientReport shape we have today
```

The track "final report on removal" becomes: a collector listens for `*-track-removed` and
snapshots the track at that moment — no special-case event baked into the core (or we keep a thin
`client-track-report` powered by the snapshot, if we want the convenience event).

### Why this direction

It matches where the rest of the library is heading: a lean core (live state + single event bus +
sinks) with opinionated/aggregation concerns pushed to opt-in modules. It removes the hot-path
cost, kills the duplicated counters, and makes report shape/bucketing fully the app's choice.

## Alternatives considered

- **B — on-demand `getReport()`**: keep a report concept but compute it lazily from current state
  (`client.getReport()`) instead of accumulating each tick. Removes hot-path cost + duplication,
  but still bakes the schema and buckets into the core. Simpler than A, less flexible.
- **C — pluggable report builders**: keep accumulation in the entities but make the builder a
  configurable strategy (`new Observer({ createClientReport, … })`). Configurable shape, but still
  runs in the hot path and keeps reporting coupled to the core.

## Open questions

- Keep **any** reporting in core, or fully externalize to collectors (recommended: externalize;
  ship collectors as provided modules)?
- Snapshot shape: **typed per-entity** snapshots (`ClientSnapshot`, `PeerConnectionSnapshot`, …) vs
  a generic record? (Lean toward typed.)
- Snapshot timing: pull (`createSnapshot()` on demand) vs push (emit a snapshot on each `*-updated`
  tick)? Could support both — pull primitive + an opt-in "emit snapshot on update" collector.
- Does the observer offer a built-in snapshot ring buffer / time series, or leave storage to the
  app (we already have sinks for raw samples)? Lean toward leaving storage to the app.
- Transition: keep the existing `report` fields working until collectors land, then deprecate, or
  cut over in one breaking beta release?
