# Changelog

## 1.0.0

First stable release of `@observertc/observer-js` — a server-side Node.js library that turns a stream
of WebRTC `ClientSample`s into a live, queryable model of every call, correlates that model **across
participants**, and raises the findings no single endpoint can reach on its own.

The organising principle, and the thing to understand before reading the rest:

> **If a condition is detectable on the client, the client's issue is the source of truth.**
> `client-monitor-js` already decides *what is wrong with an endpoint*, with hysteresis and
> multi-signal confirmation behind each verdict. observer-js never re-derives those verdicts from raw
> counters. It answers the questions no browser can: *who else is in this state right now, what do
> they have in common, and where in publisher → SFU → subscriber does the fault begin?*

### ⚠️ Breaking changes

**`ObservedInboundRtp.bitrate` is now bits per second.** It was computed as
`(deltaBytes * 8) / elapsedMs` — bits per *millisecond*, i.e. **1000× smaller** than
`ObservedOutboundRtp.bitrate` and the client-level bitrates, which were already bps. The same field
name meant two different units depending on direction. **If you have thresholds or dashboards reading
inbound `bitrate`, they need rescaling by 1000.**

**`currentRttInMs` no longer blends two different round trips.** It previously took the median of
ICE/STUN RTT (which terminates at the SFU) and RTCP RTT (end to end) mixed together, so the value
moved as streams came and went for reasons unrelated to the network. It now *prefers*
`rtcpRttInMs` and falls back to `iceRttInMs` — always one kind within a tick, never an average of
both. See the new fields below.

**Mediasoup sample types lost their index signature.** `MediasoupRouterSample` and the per-entity
sample types were `Record<string, unknown> & { … }`, which allowed arbitrary top-level keys but also
silently accepted typos on real fields and weakened autocomplete. Custom data now belongs in the
typed `attachments` slot present on every entity. If you assigned ad-hoc keys directly onto a sample,
move them into `attachments`.

**`mediasoup` is now an optional `peerDependency`** (`>=3.11.0`). It was only in `devDependencies`
while `ObservedMediasoupRouter` exposed `types.Router` in its public signature, so the emitted
declarations referenced a package consumers might not have. Runtime is unaffected — the import is
type-only. Install `mediasoup` yourself if you use the mediasoup integration; ignore the optional
peer warning if you don't.

**The per-detector `registry` config option is gone.**

**`updatePolicy` / `defaultCallUpdatePolicy` are gone, and so is the pluggable `Updater`.** The
update model is now structural rather than configurable: *a call is updated when any of its clients
is; the observer is updated when any of its calls is* — so the observer is updated exactly when any
client anywhere is. Two booleans, both defaulting to `true`, opt out of a link in that chain:
`ObserverConfig.autoUpdateOnCallUpdate` and `ObservedCallSettings.autoUpdateOnClientUpdate`. Set both
`false` and drive `observer.update()` yourself for a fixed cadence.

The old `'update-when-all-…'` policies are removed rather than renamed. "When all clients have
updated" sounds appealing and deadlocks on the first client that stops sending — one silent
participant froze the whole call's aggregation until it timed out. `src/updaters/` is deleted.

**Detector configuration is gone from `ObserverConfig`, and nothing is created implicitly.**
`observerDetectors` / `callDetectors` no longer exist as config keys; neither do `DetectorSlot` as a
config mechanism, `defaultCallDetectorsConfig`, `defaultObserverDetectorsConfig`,
`createCallDetectors`, `createObserverDetectors` or `detectorSlot`. `new Observer()` has **zero**
detectors. Register what you want with `observer.addObserverDetector(...)`,
`observer.addCallDetector(...)` and `observedCall.addDetector(...)` — see *Detector registration*
below.

**`ConcurrentIssueDetector` is split** into `CallConcurrentIssueDetector` and
`ObserverConcurrentIssueDetector`, with `lastCohorts` renamed `lastGroups`.

**`IceDisruptionDetector` is removed** — use `ObserverConcurrentIssueDetector` with the `ice-*` issue
types. **`IssueIndex` and `TrackDistributionAggregator` are removed**; `observedCall.issueIndex` /
`observer.issueIndex` become `activeIssuesRegistry`, and `call.trackDistributionAggregator` is gone
in favour of walking the resolver links. **`ObservedCall.updateGeneration` is removed.**

**Renames:** `concludeFrom` → `concludeCallIssue` / `concludeObserverIssue`; the `validator-settled`
event → `validation-ready`; the validator name `simulcast-receiver-validator` → `simulcast-receivers`;
`ResolvedClientIssue` → `ResolvedActiveClientIssue`; `isResolutionEntry` →
`isClientIssueResolutionEntry`; `src/common/ActiveClientIssue.ts` → `src/issues/`; `SlidingWindow`
moved out of `utils/stats.ts` into `utils/SlidingWindow.ts`.

**`TurnServerHealthDetector` payload changed.** It was rewritten to the same source-of-truth
principle: it still groups relayed clients by TURN server, but "in trouble" now comes from each
client's own reported issues rather than server-side RTT/loss thresholds. `clients` /
`degradedClients` / `issueTypes` replace the old `peerConnections` / `rttInMs` / `fractionLost`
summaries.

### ⚠️ `CallIssue` and `ObserverIssue` are separate types, and the payload is evidence only

Server-raised findings are now two types sharing an `IssueBase` (`type`, `timestamp`, `conclusion?`,
`payload?`), discriminated by the scope that raised them:

| | raised by | delivered as | `scope` |
|---|---|---|---|
| `CallIssue` | `observedCall.addIssue(...)` | `call-issue` | `'call'` |
| `ObserverIssue` | `observer.addIssue(...)` | `observer-issue` | `'observer'` |

`Issue` is the union. `scope` is stamped by `addIssue` — callers pass `Omit<…, 'scope'>` — because it
is a fact about where the finding was raised, which the entity knows and a detector should not have
to restate. Putting it on the issue rather than leaving it implied by the event keeps a finding
self-describing once it leaves the bus.

**Payloads were simplified to evidence alone.** They no longer carry `type` (it is `issue.type`),
`scope`, or the `callId` already present on the event; and `conclusion` was **lifted out of the
payload** to a first-class field, so alerting reads `issue.conclusion.faultDomain` rather than
`payload.conclusion.faultDomain`. A payload that restates its own envelope invites the two to
disagree, and nothing was keeping them in step.

**`payload` is now always `Record<string, unknown>`.** The `string` variant and `issuePayloadOf()`
are removed — read `issue.payload` directly. `issuePayloadAsString(issue)` remains for boundaries
that genuinely need text. `src/common/ObserverIssue.ts` moved to `src/common/Issue.ts`.

`ClientIssue` is unchanged and still what `ObservedClient.addIssue()` / `injectIssue()` take, since
those genuinely are wire entries.

### Detector registration is explicit — nothing is created implicitly

**There is no detector configuration in `ObserverConfig`.** `new Observer()` has zero detectors, and
zero validators. An application says what it wants to watch, or it watches nothing.

```ts
observer.addObserverDetector('observer-concurrent-issue-detector', {
  issueTypes: [ 'congestion', 'ice-disconnected' ],
  minAffectedCalls: 3,
});

observer.addCallDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });
observer.removeCallDetector('unconsumed-track-detector');

observedCall.addDetector('issue-fan-out-detector', { issueTypes: [ 'freezed-video-track' ] });
```

Every `add*` is chainable. Removal by name lives on the entity and returns how many went —
`observer.removeObserverDetector(name)`, `observer.removeCallDetector(name, { includeOpenCalls? })`,
`observedCall.removeDetector(name)` — and removes *every* instance under that name, since a name can
legitimately be registered more than once.

Removal by **instance** goes through the registry, which gained the members to make that practical:
`Detectors.instances` (a copy, in registration order), `getAll(name)`, `has(name)`,
`removeByName(name)`, a `remove(detector)` that now returns a boolean instead of silently succeeding,
and `[Symbol.iterator]` so `for (const detector of call.detectors)` works. `instances` is a copy
because removing while iterating the live array would skip entries. Every removal calls
the detector's `close()`, so it unsubscribes from the issue registry and drops timers and bus
listeners — a detector removed without closing keeps being fed issues for the life of the call.

`removeCallDetector` drops the detector from calls **already open** by default, not just from future
ones: otherwise whether a detector runs depends on when a call happened to join. Removing by name
removes *every* instance under that name, since a name can legitimately be registered more than once
(`ClientPopulationIssueDetector`, once per `groupBy` axis).

`addObserverDetector` builds immediately onto `observer.detectors`. `addCallDetector` records into
the new public `observer.callDetectorConfigs` map and applies to every call created **afterwards**;
calls already open keep the set they were built with. Detectors are named by their kebab-case
`static NAME`, and the name types the config — an unknown name, or a key belonging to a different
detector, will not compile.

Each detector now owns its defaults in its own constructor, beside the doc that explains what the
threshold means. The central `defaultCallDetectorsConfig` / `defaultObserverDetectorsConfig` tables
are gone, along with `DetectorSlot` as a config mechanism, `createCallDetectors`,
`createObserverDetectors`, `detectorSlot`, `CallDetectorsConfig` and `ObserverDetectorsConfig`.

> **Why the reversal?** Earlier drafts auto-created every detector from a three-state config slot.
> A detector nobody asked for costs time on every tick and raises finding types into a handler that
> was never written to expect them. Silence you configured is better than findings you didn't.

### Issues are pushed to detectors, not polled

`ActiveIssuesRegistry` (at `observedCall.activeIssuesRegistry`, propagating into
`observer.activeIssuesRegistry`) replaces the pull-based `IssueIndex`. A detector implements
`ActiveIssueTracker` and registers for the issue types it consumes; the registry hands them over as
they open and close.

```ts
observer.activeIssuesRegistry.addIssueTracker('congestion', myDetector);
observer.activeIssuesRegistry.removeIssueTracker(myDetector);
```

A detector's cost is then proportional to the issues it actually receives rather than to the number
of participants: an `update()` that finds nothing was pushed costs one comparison, whatever the fleet
size.

**There is no wildcard subscription.** Every issue-driven detector requires an explicit, non-empty
`issueTypes` (or `publisherIssueTypes` / `receiverIssueTypes`); the default `[]` means it is
subscribed to nothing and will never fire. "Feed me everything and I'll work out what matters" moves
the decision from the application — which knows its client build and its issue vocabulary — onto a
detector that has to guess, and makes the cost of a subscription unbounded and invisible.

### `client-monitor-js` >= 4.6.0 is required, with no fallback

Every issue-driven detector reads the raise + `<type>-resolved` lifecycle. There is no path that
infers these conditions from raw counters for the benefit of older clients: the client decides
better, and maintaining a worse second implementation to be polite is how both end up wrong. Issues
without a `key` have no lifecycle and stay one-shot — reported on `client-issue`, never registered.

### New: `TurnServerOutageDetector`

Raises `TURN_SERVER_OUTAGE` (observer scope) when a TURN server's client population collapses while
the rest of the fleet carries on.

This covers what `TurnServerHealthDetector` structurally cannot. That detector groups clients by the
server relaying them and asks how many report issues — which needs clients on the server to ask. When
a TURN server fails completely, allocation fails: existing sessions drop and new clients never obtain
a relay candidate through it, so they are never attributed to it at all. Its population goes to zero
and the health detector falls silent for the worst possible reason. **Degradation makes clients
unhappy; an outage makes them disappear.**

The detector measures a server's population against its own recent peak, counting both clients gone
entirely and clients still attributed but with ICE `disconnected` / `failed` / `closed`. Because
absence is a dangerous signal — a call ending, everyone leaving at 6pm, and a fleet-wide network event
all look identical — it refuses to blame a server unless a **control group** of clients not relayed
through it is demonstrably still connected (`requireControlGroup`, on by default). Clients that fail
over cleanly to another TURN server still count as lost, which is intended: the failover worked *and*
the server is down are both true.

### New: validators, and `SimulcastReceiverValidator`

Three ship: **`SimulcastReceiverValidator`** (`simulcast-receivers`),
**`RemoteTrackResolverValidator`** (`remote-track-resolver`) and **`CodecConsistencyValidator`**
(`codec-consistency`). The first replaces `WorstReceiverContagionDetector` and still raises
`WORST_RECEIVER_CONTAGION` on the bad verdict, so alerting is unchanged.

**Validators finish; detectors don't.** A detector answers "is something wrong right now?" and the
answer differs every tick. A validator answers "is this deployment built correctly?", which only
changes on deploy — so it runs until it can decide, reports once on the new **`validation-ready`**
event, and the observer drops it, releasing whatever state it kept.
`observer.validators` holds the ones currently running and is normally empty. Re-checking means
starting another, because a deploy rather than elapsed time is what makes a structural verdict stale.

**Why "simulcast receiver" and not "RTCP".** The observable signature is a publisher's bitrate
tracking its worst receiver, and there are two causes: no simulcast/SVC layers to hand the slow
receiver, or an SFU relaying RTCP so the publisher's estimate collapses. They look identical from
outside. What the check establishes is whether **per-receiver layer selection** happens at all, so the
verdicts are named for that: `layer-decided-per-receiver` /
`layer-decided-lowest-common-denominator` / `inconclusive`.

**A positive verdict requires evidence.** The old detector could only ever report *bad*: it fired when
a publisher tracked its worst receiver and was silent otherwise. Treating that silence as success
would prove nothing, because the check only runs when a publisher has 3+ receivers with one at most
half the median. A validator that never sees those conditions simply never finishes; `report.checks`
counts the times it genuinely ran.

```ts
observer.addValidator('simulcast-receivers');
observer.on('validation-ready', ({ validator, report }) => {
  if (report.ready) record(validator, report.verdict, report.checks);
});
```

**`RemoteTrackResolverValidator`** — *is the resolver actually linking anything?* Five things here
are built on publisher↔subscriber links, and every one correctly does nothing when the links are
missing rather than guessing. So a resolver wired to the wrong id field leaves all of them
permanently silent — and **silence is what a healthy deployment looks like too**. You would conclude
your calls were clean when nothing was ever examined. Verdicts: `links-resolved` /
`no-links-resolved` / `inconclusive`; raises `REMOTE_TRACK_LINKS_UNRESOLVED`.

**`CodecConsistencyValidator`** — *is everyone on the same codec, and is it the one you think you
negotiated?* A split (participants of one call on different codecs) is a real fault with a confusing
symptom: an SFU forwarding without transcoding cannot serve them all, so some pairs see each other
and some do not, with no error anywhere — and only something holding every participant at once can
see it. The quieter half is the silent fallback: a deployment configured for VP9 or AV1 drops to VP8
whenever one endpoint cannot negotiate the preference, and the team believes it shipped AV1 months
ago. Pass `expected` and it says so. Verdicts: `codec-consistent` / `codec-split` /
`unexpected-codec` / `inconclusive`; raises `CODEC_INCONSISTENCY`.

**`observer.cancelValidator(name | validator, reason?)`** stops a check that has not decided
(`observer.validators` holds the running instances). Cancelling is not silent discarding: the
validator finishes `inconclusive` with the reason, emits `validation-ready` like any other
completion, and removes itself — so anything waiting on the verdict is freed, and "we stopped asking"
stays distinguishable from "we asked and learned nothing". `Validator.cancel` now takes an optional
`reason`, and `observer.close()` passes `'observer closed'`.

New exports: `Validator`, `RunningValidator`, `ValidationReport`, `AvailableValidatorConfigs`,
`ValidatorName`, and the three validator classes with their config, report and evidence types.

### Utility consolidation

`common/utils.ts` had grown a parallel set of helpers to `utils/stats.ts`. Removed the duplicates and
the dead weight:

- **`getMedian` → `percentileOfSorted`.** `percentile` already generalises it, and
  `percentileOfSorted` preserves `getMedian(arr, false)`'s no-copy behaviour for the per-tick scratch
  arrays in `ObservedPeerConnection`.
- **Three JSON parsers became one.** `parseJsonAs` is now the single entry point; `parseJsonObject`
  adds the "and it must be an object" guarantee on top, rather than three separate `try`/`catch`
  blocks.
- **Deleted, unused:** `getAverage`, `iteratorConverter`, `asyncIteratorConverter`, `isValidUuid`,
  `safePromise`, `PartialBy`, `Writable`. None were exported from the package entry.

### Cross-call correlation and conclusions

**`ConcurrentIssueDetector` is split into two classes**, because its two scopes were two different
questions: `CallConcurrentIssueDetector` asks "is this meeting in trouble?", and
`ObserverConcurrentIssueDetector` asks "is our infrastructure in trouble?". One class branching on
what it was handed meant every call site passed the other scope's fields as placeholders, and the
observer scope behaved as the call test with a bigger denominator — wrong in both directions: one
thirty-person meeting with congestion cleared every client threshold and raised a fleet alert for a
single bad room, while a genuine fleet event — six broken calls out of forty — was a small share of
all clients and got suppressed by the participant ratio.

`ObserverConcurrentIssueDetector`:

- requires the cohort to span at least `minAffectedCalls` **independent calls** (default `2`);
- does **not** apply `affectedRatioThreshold` (call scope only), using `affectedCallRatioThreshold`
  (default `0`, off) instead;
- raises its own types: **`CROSS_CALL_CONCURRENT_ISSUES`** and **`CROSS_CALL_ISSUE_ONSET_BURST`**.

This is what makes `congestion` or `ice-*` opening across unrelated calls an actionable
infrastructure signal: those clients share no room, no publisher and no host — only the servers.

Each exposes `lastGroups` for tests and dashboards; the observer one carries the call dimension
(`callIds`, `totalCalls`, `affectedCallRatio`, `perCall`), the call one does not, because at call
scope it is always `1` and carries no information. `ActiveClientIssue` / `ResolvedActiveClientIssue`
gained `callId`.

**New: conclusions.** Every issue-driven finding now carries a `conclusion` field, beside the payload
rather than inside it:

```jsonc
"conclusion": {
  "faultDomain": "infrastructure",
  "summary": "network congestion is open across independent calls at the same time — 6 of 40 calls",
  "recommendation": "check SFU egress bandwidth and host network saturation before …",
  "confidence": 0.85
}
```

`faultDomain` (`infrastructure` | `call` | `published-track` | `endpoint` | `client-population` |
`unknown`) is derived from the **spread**, not the issue type — the client reports the identical
symptom whether it is one meeting or the whole fleet. One inversion is encoded deliberately:
`cpu-limitation` spread across independent calls concludes **`client-population`**, not
`infrastructure`, because endpoint CPU is owned by the endpoint and breadth points at a shared client
release or browser version rather than the SFU. Unknown issue types still get a structurally valid
conclusion from the spread.

Two functions are exported, one per scope: **`concludeCallIssue()`** and
**`concludeObserverIssue()`**. A detector already knows its scope, and the single generic
`concludeFrom()` forced every caller to supply the other scope's fields as placeholders —
call-scoped detectors passing `affectedCalls: 1, totalCalls: 1` forever, observer-scoped ones
passing a participant ratio that was deliberately never read. `concludeObserverIssue` also now
returns `call` (not `infrastructure`) when only one call is affected, rather than dressing a single
bad room up as a fleet event.

### Removed: the metric-driven detectors

`CallWideDegradationDetector`, `CommonSourceDegradationDetector`, `PliAndFreezeFanOutDetector` and
`AudioImpairmentFanOutDetector` are **removed**. They applied their own thresholds to raw counters to
reach conclusions the client already reaches better, and where clients report issues they produced a
second finding for one condition. The library now requires `client-monitor-js` >= 4.6.0 for detection
and builds everything on the issue lifecycle.

| Removed | Use instead |
|---------|-------------|
| `CommonSourceDegradationDetector` | `IssueFanOutDetector` |
| `PliAndFreezeFanOutDetector` | `IssueFanOutDetector` (`keyframe-storm`, `freezed-video-track`) |
| `AudioImpairmentFanOutDetector` | `IssueFanOutDetector` (`audio-concealment`, `audio-jitter-buffer-stress`) |
| `CallWideDegradationDetector` | `CallConcurrentIssueDetector` |
| `IceDisruptionDetector` | `ObserverConcurrentIssueDetector` with the `ice-*` issue types |

**`IceDisruptionDetector` is removed too.** It was the last detector reading raw stats — ICE state
transitions — to reach a verdict `client-monitor-js` >= 4.6.0 already reports as the keyed issues
`ice-disconnected`, `ice-connection-failed`, `ice-transport-stalled` and `unstable-ice-path`, each
with hysteresis behind it. The client knows whether `disconnected` persisted or healed in 200 ms; the
observer does not. Correlating ICE trouble is now configuration, not a class:

```ts
observer.addObserverDetector('observer-concurrent-issue-detector', {
  issueTypes: [ 'ice-disconnected', 'ice-connection-failed', 'ice-transport-stalled' ],
});
```

### New: `ClientPopulationIssueDetector`

Raises `CLIENT_POPULATION_ISSUE` (observer scope) when an issue is concentrated on **one kind of
client** — one browser, one browser version, one OS — rather than on anything the servers own.

Every other observer-scoped detector reasons "clients in unrelated calls share only the
infrastructure, so it must be us". That is right for network symptoms and **wrong for endpoint
ones**: `cpulimitation` across six unrelated calls is not an SFU event, because CPU is owned by the
endpoint. `IssueConclusion` already encoded that inversion — mapping the endpoint-capacity family to
a `client-population` fault domain — but nothing in the library computed the grouping the claim
referred to. This detector is that computation, and it is the one correlation here that is neither
per-call nor per-server: a client knows its own browser and nothing about anyone else's.

The gate is **relative risk**, not share. "30% of Chrome 141 is unhappy" means nothing if 30% of
everyone is; a share-based rule simply indicts whichever browser is most popular. A population
qualifies only when it is `minRelativeRisk` times worse than the rest of the fleet, and only when the
rest of the fleet is itself big enough (`minControlSize`) to be a measurement. Clients that never
reported their metadata are excluded from **both** sides rather than bucketed as `'unknown'` — a
synthetic unknown population is a mixture of every real one, so its rate means nothing.

Groups by `browser` / `engine` / `platform` / `operationSystem`, one axis per instance.

### New: `PublisherFaultCorroborationDetector`

Raises `CORROBORATED_PUBLISHER_FAULT` (call scope) when **both ends of one published track** are
complaining at once: the publisher about its own send path (`encoder-bottleneck`,
`capture-bottleneck`, `dry-outbound-track`) and its subscribers about receiving it
(`freezed-video-track`, `dry-inbound-track`).

`IssueFanOutDetector` sees one end and infers the source, which is sound and still an inference — the
identical observation is produced by the SFU mangling a perfectly healthy publisher's stream on the
way out. This removes the inference: two independent parties, one conclusion. Its confidence is the
highest in the library (0.9), and it is the strongest statement the library can make about where a
fault sits. Run both — fan-out is broader and catches the forwarding case where the publisher is
fine.

### New: `SfuCongestionDetector`

Raises `sfu-congestion` (observer scope) when the share of clients reporting congestion spikes
against its own recent baseline. Add it only when the observer's calls all come from the **same SFU**
— the finding's meaning is "these clients share only that server".

It counts distinct clients reporting congestion in **fixed wall-clock buckets** rather than on the
update tick. The tick is unevenly spaced (it fires per client update, so its rate is a function of
how many clients are connected) and shorter than a client's sampling period, so counting on it
compares windows of different lengths and calls the difference a signal. Each closed bucket is judged
against a median+MAD baseline of the ones before it via `robustZScore`, plus practical-significance
gates (`minAffectedClients`, minimum absolute and relative increase) so a statistically perfect
signal over three clients cannot page anyone.

Unlike the concurrent-issue detectors it ignores resolutions: a congested client typically fixes its
own symptom by dropping bitrate hard, so the issue closes within seconds — but it still happened, and
that is the evidence wanted here.

### Performance

The hot path is `accept()` plus `call.update()`, and the detector pipeline did not scale the way it
should have. Two structural fixes, both measurable with `yarn bench`:

**Issue queries are now indexed rather than searched.** Every detector built its own registry object,
and every query — *who has issue X open?*, *which of these tracks are broken?* — walked every client
of the scope and rebuilt an array. Worse, `totalClients` re-walked them once per cohort. That cost
scaled with **participants** instead of with the thing being asked about, so a healthy 1200-client
fleet with no open issues did the same work as a broken one.

`ActiveIssuesRegistry` inverts it: issues are **pushed** to the detectors that registered for their
type as they open and close, so a detector holds only what it was given. An `update()` that finds
nothing was pushed costs one comparison, whatever the fleet size.
`ObservedClient.activeIssues` remains the authoritative store, so there is still exactly one copy of
each issue in memory.

**`UnconsumedTrackDetector` no longer walks the call.** It read every published track of every peer
connection of every client on each tick to ask "does this one have subscribers?" — a question whose
answer only changes when a track gains its first or loses its last subscriber. `RemoteTrackResolver`
already observes exactly those moments, so it now maintains `observedCall.unconsumedOutboundTracks`
and the detector reads that. A healthy call, where every track has subscribers, costs one
`size === 0` check. Measured at 60 calls × 20 participants (1 200 published tracks): **529 µs → 65 µs
per tick.**

**Track lookups start from the affected minority.** `IssueFanOutDetector`,
`TrackDeliveryMismatchDetector` and the simulcast check each rebuilt the whole publisher→subscriber
distribution set every tick — the same traversal, the same percentile sorts, three times over — to
find the handful of tracks that were actually in trouble. They now start from the issues the registry
pushed at them and resolve *those* tracks, through the reporting client's own peer connections
(typically one or two) rather than through the call. The shared aggregator and its
`updateGeneration` cache key are both gone with it: a cache key that has to be bumped from two
different places to stay correct is bookkeeping standing in for a structural fact.

Alongside that: `summarize()` sorted its input three times (once per percentile) and now sorts once;
`aggregateTrack` replaced a dozen `map`/`filter`/`reduce` passes with a single loop; and a receiver
entry no longer allocates a `reasons` array in the healthy case.

Measured at 20 calls × 12 participants (2 640 subscriptions), detector work per tick:

| | before | after |
|---|---|---|
| all detectors | 3.9 ms | 1.3 ms |

Allocation is now the dominant remaining cost — one entry object per subscription per tick. Reusing
those objects across ticks would help further but makes an aggregation result invalid after the next
`aggregate()`, so it is deliberately not done.

**Also removed:** the per-detector `registry: { maxIssueAgeInMs }` option. Expiry was a read-time
filter that every detector re-applied and none of which ever actually removed anything. It is now
`ObserverConfig.maxIssueAgeInMs` (default `120_000`), applied once per `call.update()` against the
shared index — so an expired issue is genuinely forgotten and emits `client-issue-resolved` with
`resolvedBy: 'timeout'` like any other ending interval.

### Client issue lifecycle

With `client-monitor-js` **>= 4.6.0** the whole issue lifecycle reaches the server, and observer-js
mirrors it. A stateful issue arrives as two `clientIssues[]` entries sharing a `key`:

```
raise:      { type: 'stuck-decoder',          key, payload,                                timestamp: raisedAt }
resolution: { type: 'stuck-decoder-resolved', key, payload: { raisedAt, comment, …final }, timestamp: resolvedAt }
```

- **`ClientIssue.key`** added to the schema.
- **`ObservedClient.activeIssues`** — the live per-client map of open issues.
- **`client-issue-resolved`** event, carrying the finished interval (`durationInMs`, `resolvedBy`).
- The `-resolved` suffix is stripped, a re-raise refreshes the payload without restarting `raisedAt`,
  keyless entries stay one-shot, and issues still open when a client closes are force-resolved
  (`resolvedBy: 'client-closed'`) so a departed participant can't leak an "active" issue.

This turns point-in-time symptom reports into **intervals**, which is what makes concurrency
measurable: "several clients are congested *right now, simultaneously*" instead of "several clients
reported congestion in the last 10 seconds".

### Correlation primitives

- **`ActiveIssuesRegistry`** — the open client issues of a scope, plus the fan-out that pushes them
  to registered `ActiveIssueTracker`s. Call-level registries propagate into the observer's. Onset
  spread is measured on the **observer clock**, never client clocks, because skew between machines
  would otherwise look like a synchronized infrastructure event.
- **The resolver links** — `outboundTrack.remoteInboundTracks`, `inboundTrack.remoteOutboundTrack`,
  `observedCall.unconsumedOutboundTracks`. Detectors walk these directly. (A
  `TrackDistributionAggregator` class used to summarise every published track against its receivers
  on every tick; it scanned the majority to find the interesting minority, which is the wrong axis.)
- **`CallHealthAggregator`** — the client axis: per-client health split into sending vs receiving,
  percentile rollups, quality-limitation (cpu/bandwidth) counts.
- **`utils/stats`** — `percentile`, `percentileOfSorted`, `median`, `medianAbsoluteDeviation`,
  `robustZScore`, `summarize`, `counterDelta`, `correlation`, `pageHinkley`, `mannKendall`.
  Summaries are medians and percentiles rather than means, because one participant at 1500 ms RTT
  would otherwise hide nine healthy ones.
- **`SlidingWindow`** (moved to `utils/SlidingWindow.ts`) and **`TrendTester`** — the streaming home
  for the two trend tests. Mann-Kendall answers "is this drifting?", Page-Hinkley answers "did it
  change, and when?"; neither subsumes the other, which is why both read from one window.

### Detectors

Call-scoped detectors go on `observedCall.detectors`, cross-call ones on `observer.detectors` (new in
this release, alongside `observer.addIssue()` and the `observer-issue` event). Each is debounced —
`consecutiveTicks`, or `windowMs` + `cooldownMs` — so a condition must persist rather than appear in
one sample.

The correlation set, each answering something no endpoint can:

| Detector | Scope | Raises |
|----------|-------|--------|
| `CallConcurrentIssueDetector` | call | `CONCURRENT_CLIENT_ISSUES`, `ISSUE_ONSET_BURST` |
| `ObserverConcurrentIssueDetector` | observer | `CROSS_CALL_CONCURRENT_ISSUES`, `CROSS_CALL_ISSUE_ONSET_BURST` |
| `IssueFanOutDetector` | call | `PUBLISHED_TRACK_ISSUE_FAN_OUT`, `SINGLE_RECEIVER_ISSUE` |
| `PublisherFaultCorroborationDetector` | call | `CORROBORATED_PUBLISHER_FAULT` |
| `TrackDeliveryMismatchDetector` | call | `PUBLISHED_TRACK_NOT_DELIVERED`, `RECEIVER_TRACK_NOT_DELIVERED`, `PUBLISHER_TRACK_DRY` |
| `UnconsumedTrackDetector` | call | `UNCONSUMED_PUBLISHED_TRACK` |
| `ClientPopulationIssueDetector` | observer | `CLIENT_POPULATION_ISSUE` |
| `TurnServerHealthDetector` | observer | `TURN_SERVER_DEGRADED` |

Infrastructure:

| Detector | Scope | Raises |
|----------|-------|--------|
| `TurnServerOutageDetector` | observer | `TURN_SERVER_OUTAGE` |
| `SfuCongestionDetector` | observer | `sfu-congestion` |

Two worth calling out. **`TrackDeliveryMismatchDetector`** resolves an ambiguous symptom: a dry track
could be a switched-off camera, a broken forwarding path, or a wedged consumer, and all three look
identical from the browser — joining both ends of the track separates them, with no mediasoup
instrumentation required. **`PublisherFaultCorroborationDetector`** is the only finding here that
needs no interpretation at all: the publisher and its subscribers independently report the two halves
of one fault, so nothing is inferred.

`Detector` gained an optional `close()`, called when a detector is removed or its registry is cleared
(which now happens when the owning call/observer closes).

### Derived metrics

- **Per-tick, counter-reset-safe deltas** across the RTP entities: freezes, PLI/NACK/FIR, concealed
  samples and events, frames received/decoded/dropped/rendered, decode time, packets discarded,
  jitter-buffer delay and emitted count, retransmissions, FEC; and on the outbound side encode time,
  key frames, retransmissions, quality-limitation changes.
- **Derived ratios**: `jitterBufferDelayInMs` (correctly from the delay/emitted-count *pair*),
  `concealmentRatio`, `framesDroppedRatio`.
- **`iceRttInMs` / `rtcpRttInMs` / `sfuHopRttInMs`** on `ObservedPeerConnection`. The first is the
  client↔SFU leg, the second is end to end, and their difference estimates everything past the SFU —
  which separates "this client's last mile is slow" from "the path beyond the SFU is slow".
- **`counterResetBoundary`** on the RTP entities. Chrome resets an SSRC's cumulative counters on a
  codec switch ([crbug/webrtc/5361](https://bugs.chromium.org/p/webrtc/issues/detail?id=5361)); deltas
  are suppressed for that tick so a room-wide codec rollout can't fire a synchronized fake alert.

### Mediasoup sample ergonomics

- **`attachments` on every entity sample**, not just the router.
- **Id-indexed accessors** — `getTransportSample`, `getProducerSample`, `getConsumerSample`,
  `getDataProducerSample`, `getDataConsumerSample` — plus `attachTo(id, attachments)`, which merges
  into any entity kind and returns `false` for an unknown id instead of failing quietly.
- **Lifecycle events**: `transport-sample-added`/`-closed`, `producer-sample-added`/`-closed`,
  `consumer-sample-added`/`-closed`, `data-producer-sample-added`/`-closed`,
  `data-consumer-sample-added`/`-closed`. Each carries the **live** sample object plus the mediasoup
  object, so a handler can annotate on the fly.
- **`enrich` hook** in the settings, mirroring mediasoup's own `appData` declaratively. It runs
  *before* the `-added` event, so listeners can build on what it attached; a throwing enricher is
  caught and logged.
- **`snapshot()`** — a detached deep copy, for reports that shouldn't keep changing after you build
  them.
- Mediasoup router ↔ peer-connection matching is opt-in via
  `matchPeerConnectionByWebRtcTransportId`, and emits
  `mediasoup-router-matched-with-peer-connection` per matching peer connection. The observer stores
  nothing on the call — the application owns the association.

### Fixes

- **Inbound RTP deltas dropped their first interval.** The guards were truthiness-based
  (`this.packetsLost && …`), so a previous value of `0` disabled the delta — and since counters start
  at zero, the *first* loss, freeze or PLI burst of every stream was silently invisible. All deltas
  now use a shared counter-reset-safe helper that treats `0` as a valid baseline.
- **`ObservedInboundRtp.jitter` was permanently `undefined`** — reset at the top of `update()` and
  never assigned. Likewise `framesReceived`, `retransmittedPacketsReceived` and
  `retransmittedBytesReceived`, which is why `bitPerPixel` was always `0`.
- **`fractionLost` reported `undefined` instead of `0`** when there was traffic but no loss, making
  "healthy" indistinguishable from "no data".
- **`bitPerPixel` wasn't bits per pixel** on either side — it divided by frames, never pixels.
- **Outbound `payloadBitrate` had an operator-precedence bug**: `a ?? 0 - b` parsed as
  `a ?? (0 - b)`, so it always equalled `bitrate` and never subtracted header bytes.
- **Outbound `bitPerPixel` subtracted in reverse** (previous − current), so it was always negative.
- **Client bitrates could be `Infinity`/`NaN`** when two samples landed in the same millisecond;
  the division is now guarded.
- **TURN detection read the server url from the wrong candidate.** Per W3C webrtc-stats the `url` is
  only exposed on *local* candidates, so attribution effectively never fired. `usingTURN` no longer
  requires a url at all (a `relay` candidate is by definition from a TURN server), `turns:` (TLS) now
  matches, the server key is derived by stripping the `?transport=` query instead of `new URL()`
  (which parses `turn:` as an opaque path), and the created server is actually registered in
  `ObservedTURN.servers` with its peer connections — previously the map stayed empty, so
  `update()` and `removePeerConnection()` did nothing.
- **`Observer.accept()` needed an explicit return type** to break a circular-inference error that
  failed the whole test suite under `ts-jest`.

### Packaging & tooling

- Server-side, **Node.js >= 22**, dual **ESM + CommonJS** from a single entry, with `.d.ts`/`.d.mts`.
- `skipLibCheck` enabled — dependency declarations (mediasoup, flatbuffers) target newer TS/lib
  versions than this project and were failing `tsc` and the `tsup` dts step.
- CI runs lint + typecheck + build + tests with **coverage floors** (statements 80 / branches 56 /
  functions 73 / lines 83).
- Two runnable examples, both standalone on synthetic samples:
  [`examples/sfu-observer.ts`](./examples/sfu-observer.ts) (`yarn example`) walks the whole path, and
  [`examples/detectors.ts`](./examples/detectors.ts) (`yarn example:detectors`) gives every detector
  a scenario of its own and asserts each one fires.
