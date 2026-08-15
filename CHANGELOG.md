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

**The per-detector `registry` config option is gone**, replaced by `ObserverConfig.maxIssueAgeInMs`
— see *Performance* below.

**Detectors are now created automatically and are ON by default.** Previously both registries
shipped empty and every detector was opt-in. `new Observer()` now creates all of them with default
settings. If you were relying on an empty registry, pass `observerDetectors: null` and `callDetectors: null`.
See *Detector configuration* below for the per-detector opt-out.

**`TurnServerHealthDetector` payload changed.** It was rewritten to the same source-of-truth
principle: it still groups relayed clients by TURN server, but "in trouble" now comes from each
client's own reported issues rather than server-side RTT/loss thresholds. `clients` /
`degradedClients` / `issueTypes` replace the old `peerConnections` / `rttInMs` / `fractionLost`
summaries.

### ⚠️ `ObserverIssue`: server-raised findings carry the payload object

`observedCall.addIssue()` / `observer.addIssue()` took a `ClientIssue`, whose `payload` must be a
**string** because `ClientIssue` is a *wire* type — it arrives inside a `ClientSample`. Server-raised
findings never go on the wire; they go straight to an in-process handler. Reusing the wire type meant
every detector `JSON.stringify`'d a perfectly good object on the way out and every handler
`JSON.parse`'d it back on the way in, paying serialisation on a path where nothing is serialised and
losing type information in both directions.

Both methods now take the new **`ObserverIssue`**:

```ts
type ObserverIssue = {
  type: string;
  timestamp: number;
  payload?: string | Record<string, unknown>;   // prefer the object
};
```

`call-issue` and `observer-issue` carry it. **Handlers that did `JSON.parse(issue.payload)` must
stop** — read `issue.payload` directly, or use the exported `issuePayloadOf(issue)` which accepts
either form and returns `Record<string, unknown> | undefined` without throwing. `string` is still
accepted so an application can forward an already-serialised payload; `issuePayloadAsString(issue)`
goes the other way for log lines, HTTP bodies and queues — keep that at the edge rather than in a
detector.

`ClientIssue` is unchanged and still what `ObservedClient.addIssue()` / `injectIssue()` take, since
those genuinely are wire entries.

### Detector configuration

Detectors are configured through `ObserverConfig`, mirroring `client-monitor-js` so the same mental
model applies on both sides of the wire. Each slot is:

- **omitted / `undefined`** — created with defaults
- **an object** — created with those overrides
- **`null`** — not created

```ts
new Observer({
  observerDetectors: { turnServerOutageDetector: { minClientsAtPeak: 10 } },   // observer-scoped
  callDetectors: { iceDisruptionDetector: null },                      // call-scoped, every call
});
```

`observerDetectors: null` / `callDetectors: null` disables a whole scope; `ObservedCallSettings.detectors`
overrides the call-scoped set for one call. Naming one key never disables the others — unnamed slots
still get defaults, so disabling is always explicit. Manual registration via `detectors.add(...)`
still works. New exports: `CallDetectorsConfig`, `ObserverDetectorsConfig`, `DetectorSlot`,
`createCallDetectors`, `createObserverDetectors`, `detectorSlot`.

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

`WorstReceiverContagionDetector` is replaced by **`SimulcastReceiverValidator`**, started with
`observer.addValidator('simulcast-receiver-validator', config)`. It still raises
`WORST_RECEIVER_CONTAGION` on the bad verdict, so alerting is unchanged.

**Validators finish; detectors don't.** A detector answers "is something wrong right now?" and the
answer differs every tick. A validator answers "is this deployment built correctly?", which only
changes on deploy — so it runs until it can decide, reports once on the new **`validator-settled`**
event, and the observer drops it, releasing the sliding window it kept per published track.
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
observer.addValidator('simulcast-receiver-validator');
observer.on('validator-settled', ({ validator, report }) => {
  if (report.ready) record(validator, report.verdict, report.checks);
});
```

New exports: `Validator`, `RunningValidator`, `ValidationReport`, `AvailableValidatorConfigs`,
`ValidatorName`, `SimulcastReceiverValidator`, `defaultSimulcastReceiverValidatorConfig`.

For the record this was not a performance change: the detector's marginal cost was **0.08 ms/tick** at
20 calls × 12 participants, because it shared its aggregation with two other detectors. The wins are
the retained per-track windows and being able to say something true about what has been verified.

### Utility consolidation

`common/utils.ts` had grown a parallel set of helpers to `utils/stats.ts`. Removed the duplicates and
the dead weight:

- **`getMedian` → `percentileOfSorted`.** `percentile` already generalises it, and
  `percentileOfSorted` preserves `getMedian(arr, false)`'s no-copy behaviour for the per-tick scratch
  arrays in `ObservedPeerConnection`.
- **Three JSON parsers became one.** `parseJsonAs` is now the single entry point, with a new
  `parseJsonObject` adding the "and it must be an object" guarantee; `parseIssuePayload` and
  `issuePayloadOf` are thin wrappers over it rather than three separate `try`/`catch` blocks.
- **Deleted, unused:** `getAverage`, `iteratorConverter`, `asyncIteratorConverter`, `isValidUuid`,
  `safePromise`, `PartialBy`, `Writable`. None were exported from the package entry.

### Cross-call correlation and conclusions

**`ConcurrentIssueDetector` now treats its two scopes as different questions.** At call scope it asks
"is this meeting in trouble?"; at observer scope, "is our infrastructure in trouble?". Previously the
observer scope was the same test with a bigger denominator, which is wrong in both directions: one
thirty-person meeting with congestion cleared every client threshold and raised a fleet alert for a
single bad room, while a genuine fleet event — six broken calls out of forty — was a small share of
all clients and got suppressed by the participant ratio.

At observer scope the detector now:

- requires the cohort to span at least `minAffectedCalls` **independent calls** (default `2`);
- does **not** apply `affectedRatioThreshold` (call scope only), using `affectedCallRatioThreshold`
  (default `0`, off) instead;
- raises its own types: **`CROSS_CALL_CONCURRENT_ISSUES`** and **`CROSS_CALL_ISSUE_ONSET_BURST`**.

This is what makes `congestion` or `ice-*` opening across unrelated calls an actionable
infrastructure signal: those clients share no room, no publisher and no host — only the servers.

**New: `IssueCohort` carries the call dimension** — `callIds`, `totalCalls`, `affectedCallRatio`, and
a `perCall` breakdown. `ActiveClientIssue` / `ResolvedClientIssue` gained `callId`.

**New: conclusions.** Every issue-driven finding now carries a `conclusion` in its payload:

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
conclusion from the spread. `concludeFrom()` is exported for use in your own detectors.

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
| `CallWideDegradationDetector` | `ConcurrentIssueDetector` (call scope) |

**`IceDisruptionDetector` is kept**, and is the one detector that doesn't read client issues. It
reads ICE state *transitions*, which arrive in every sample regardless of what the client runs and
which can occur and revert between two `update()` ticks. It subscribes to the bus and implements
`close()` accordingly.

### Performance

The hot path is `accept()` plus `call.update()`, and the detector pipeline did not scale the way it
should have. Two structural fixes, both measurable with `yarn bench`:

**Issue queries are now indexed rather than searched.** Every detector built its own registry object,
and every query — *who has issue X open?*, *which of these tracks are broken?* — walked every client
of the scope and rebuilt an array. Worse, `totalClients` re-walked them once per cohort. That cost
scaled with **participants** instead of with the thing being asked about, so a healthy 1200-client
fleet with no open issues did the same work as a broken one.

`IssueIndex` now maintains the reverse lookups incrementally: one index per call
(`observedCall.issueIndex`), propagating into `observer.issueIndex`, updated as issues open and close.
`ObservedClient.activeIssues` remains the authoritative store, so there is still exactly one copy of
each issue in memory. Queries cost O(matching issues):

| open issues (1200 clients) | `cohorts()` |
|---|---|
| 0 | 0.1 µs |
| 60 | 11 µs |
| 600 | 54 µs |

**`UnconsumedTrackDetector` no longer walks the call.** It read every published track of every peer
connection of every client on each tick to ask "does this one have subscribers?" — a question whose
answer only changes when a track gains its first or loses its last subscriber. `RemoteTrackResolver`
already observes exactly those moments, so it now maintains `observedCall.unconsumedOutboundTracks`
and the detector reads that. A healthy call, where every track has subscribers, costs one
`size === 0` check. Measured at 60 calls × 20 participants (1 200 published tracks): **529 µs → 65 µs
per tick.**

**Per-tick derivations are memoised and shared.** `IssueFanOutDetector`,
`TrackDeliveryMismatchDetector` and `WorstReceiverContagionDetector` each built their own
`TrackDistributionAggregator` and recomputed the whole publisher→subscriber distribution set every
tick — the same traversal, the same percentile sorts, three times over. They now share
`observedCall.trackDistributionAggregator`, memoised against the new `ObservedCall.updateGeneration`
(bumped on every accepted sample and at the start of every `update()`, so a detector driven directly
never reads a stale aggregation).

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

- **`IssueIndex`** — the indexed active-issue set, at call (`observedCall.issueIndex`) **or** observer
  (`observer.issueIndex`) scope. `cohorts`, `cohortOf`, `byTrackIds`, `byClientId`, `ofType`,
  `ofTrack`, `ofClient`, plus expiry via `prune`. Onset spread is measured on the **observer clock**,
  never client clocks, because skew between machines would otherwise look like a synchronized
  infrastructure event.
- **`TrackDistributionAggregator`** — one published track against all of its subscribers: per-receiver
  health with reasons, percentile summaries, and freeze/PLI/concealment fan-out counters.
- **`CallHealthAggregator`** — the client axis: per-client health split into sending vs receiving,
  percentile rollups, quality-limitation (cpu/bandwidth) counts.
- **`utils/stats`** — `percentile`, `median`, `summarize`, `counterDelta`, `SlidingWindow`. Summaries
  are medians and percentiles rather than means, because one participant at 1500 ms RTT would
  otherwise hide nine healthy ones.

### Detectors

Call-scoped detectors go on `observedCall.detectors`, cross-call ones on `observer.detectors` (new in
this release, alongside `observer.addIssue()` and the `observer-issue` event). Each is debounced —
`consecutiveTicks`, or `windowMs` + `cooldownMs` — so a condition must persist rather than appear in
one sample.

The correlation set, each answering something no endpoint can:

| Detector | Scope | Raises |
|----------|-------|--------|
| `ConcurrentIssueDetector` | call | `CONCURRENT_CLIENT_ISSUES`, `ISSUE_ONSET_BURST` |
| `ConcurrentIssueDetector` | observer | `CROSS_CALL_CONCURRENT_ISSUES`, `CROSS_CALL_ISSUE_ONSET_BURST` |
| `IssueFanOutDetector` | call | `PUBLISHED_TRACK_ISSUE_FAN_OUT`, `SINGLE_RECEIVER_ISSUE` |
| `TrackDeliveryMismatchDetector` | call | `PUBLISHED_TRACK_NOT_DELIVERED`, `RECEIVER_TRACK_NOT_DELIVERED`, `PUBLISHER_TRACK_DRY` |
| `UnconsumedTrackDetector` | call | `UNCONSUMED_PUBLISHED_TRACK` |
| `TurnServerHealthDetector` | observer | `TURN_SERVER_DEGRADED` |

Infrastructure:

| Detector | Scope | Raises |
|----------|-------|--------|
| `TurnServerOutageDetector` | observer | `TURN_SERVER_OUTAGE` |
| `IceDisruptionDetector` | call | `CALL_ICE_DISRUPTION` |

Two worth calling out. **`TrackDeliveryMismatchDetector`** resolves an ambiguous symptom: a dry track
could be a switched-off camera, a broken forwarding path, or a wedged consumer, and all three look
identical from the browser — joining both ends of the track separates them, with no mediasoup
instrumentation required. **`WorstReceiverContagionDetector`** catches an SFU relaying RTCP instead of
terminating it, where one bad receiver drags the publisher's bitrate down for everyone; it's a
windowed correlation rather than a threshold, and the damage is invisible from every endpoint.

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
