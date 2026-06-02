# Design: optional track correlation, derived metrics, detectors & call-level issues

Status: **design / collection.** No code written yet — this is the thing to react to before we
build. Three connected topics:

1. **Track correlation** — an *optional*, strategy-based mechanism to link outbound tracks to the
   inbound tracks that carry them (mediasoup, p2p-by-SSRC, generic attachment-field, or custom).
2. **Expanded derived metrics** — additive only; `attachments` are never removed.
3. **Detectors & call-level issues** — what server-side detectors to build (several need #1) and
   how `call-issue` should behave.

---

## 1. Optional track correlation

### Principle

Correlation is **off by default** and never required. It's a per-call concern, set on the call
settings; when unset, nothing runs and no indexes are built. It already exists as
`ObservedCall.remoteTrackResolver?: RemoteTrackResolver` (interface below) — this design only adds
strategies and a config shape around it. **`attachments` are read, never modified**, by any
strategy.

```ts
export interface RemoteTrackResolver {
  resolveRemoteOutboundTrack(inboundTrack: ObservedInboundTrack): ObservedOutboundTrack | undefined;
  resolveRemoteInboundTracks(outboundTrack: ObservedOutboundTrack): ObservedInboundTrack[] | undefined;
}
```

A resolver subscribes (filtered to its call) to `inbound-track-added/-removed` and
`outbound-track-added/-removed` on the bus, maintains its index, and answers the two queries.
(That's exactly how the existing `MediasoupRemoteTrackResolver` works.)

### Config shape — **decided: extend `remoteTrackResolvePolicy`**

Extend the existing `remoteTrackResolvePolicy` on `ObservedCallSettings` (and a matching default
on `ObserverConfig`) into a discriminated union so the generic strategy can carry parameters.
(Chosen over adding a separate `trackCorrelation` option — one field, backwards-compatible, and
the current `'p2p'`/`'mediasoup-sfu'`/`'none'` strings fold straight in.)

```ts
export type TrackCorrelationPolicy =
  | 'none'                                   // default — no correlation, no indexes
  | 'mediasoup-sfu'                          // attachments: producerId / consumerId (today's impl)
  | 'p2p-ssrc'                               // match by SSRC across the two peers
  | {                                        // generic attachment-field mapping
      kind: 'attachment';
      // value of `outboundKey` on an outbound track's attachments is matched against
      // value of `inboundKey` on an inbound track's attachments (inboundKey defaults to outboundKey)
      outboundKey: string;
      inboundKey?: string;
    };
// (custom: assign your own `call.remoteTrackResolver` — already supported and stays supported.)
```

`Observer` instantiates the matching resolver in `createObservedCall` (where it already does this
for `'mediasoup-sfu'`); `'none'`/unset → no resolver.

### Strategies

| Strategy | Matches on | Cardinality | Notes |
|----------|-----------|-------------|-------|
| `mediasoup-sfu` | inbound `attachments.{producerId,consumerId}` ↔ outbound `attachments.producerId` | 1 outbound → N inbound | already implemented |
| `p2p-ssrc` | SSRC of the outbound RTP(s) == SSRC of the inbound RTP(s) on the other peer | 1 ↔ 1 (typically) | uses `ObservedOutboundRtp.ssrc` / `ObservedInboundRtp.ssrc`; index `ssrc → track`. Caveat: SSRC can be reused/rewritten — scope the index per call and refresh on add/remove |
| `attachment` (generic) | `outbound.attachments[outboundKey]` == `inbound.attachments[inboundKey]` | 1 → N | the app puts a shared id (e.g. a media id) in both tracks' attachments; library just indexes by it |
| custom | anything | anything | implement `RemoteTrackResolver`, assign `call.remoteTrackResolver` |

All strategies share the same add/remove/index/query skeleton, so a small
`AttributeIndexedResolver` base can back both `p2p-ssrc` and `attachment` (they differ only in the
key-extraction function). mediasoup stays its own (two-key producer/consumer mapping).

### What correlation produces (additive, no attachment changes)

Today: `inboundTrack.getRemoteOutboundTrack()` and `outboundTrack.getRemoteInboundTracks()`.
With correlation on, we can *additionally* derive cross-side fields that are otherwise impossible
server-side — populated on update, left `undefined` when no match:

- on the inbound side: the producing client/track id, end-to-end loss/delay vs. what the producer
  sent, "is anyone actually producing this" liveness.
- on the outbound side: number of consumers, worst/ળaverage consumer quality, "delivered vs sent".

These are the inputs the cross-client detectors (§3) need.

---

## 2. Expanded derived metrics (additive)

Constraint: **purely additive** — every new field sits alongside `attachments`, which stay exactly
as they are. Candidates (per the analysis), each populated in the relevant `update()` and reset at
the top of the tick if per-interval:

- inbound: jitter-buffer delay & emitted count, concealment events/samples, freeze count &
  total freeze duration, fraction-of-time frozen, fps/resolution, decode time.
- outbound: target vs actual bitrate, quality-limitation reason & durations, encode time,
  resolution/fps, retransmission ratio.
- transport/pc: available in/out bitrate trends, RTT distribution (partly present).
- first-class `direction` (`send`/`recv`), `producerId`/`consumerId`/`label` surfaced as typed
  fields **mirrored from** attachments (read-only copies — attachments remain the source of truth).

Open question: do we mirror known attachment keys into typed fields, or only expose them through
attachments? Proposal: mirror a small known set (direction, producerId, consumerId, label) for
ergonomics + typing, keep attachments authoritative and untouched.

---

## 3. Detectors we can / should implement

All are **server-side, cross-client** — things the client can't see on its own (per-client signals
already arrive as `clientIssues`). Grouped by what they need.

### Need correlation (§1)

- **Producer→consumer delivery mismatch** — producer/outbound is healthy (sending, low loss) but
  one or more correlated consumers/inbound receive poorly (high loss/freeze/no data). Strongly
  implies an SFU/forwarding problem rather than the sender. *Inputs:* outbound health + correlated
  inbound health.
- **Dead/zombie outbound track** — an outbound track with no correlated inbound anywhere (nobody
  consuming), or producing bytes that reach no one. *Inputs:* outbound + `getRemoteInboundTracks()`.
- **One-way media** — a peer pair where media flows in one direction only. *Inputs:* paired tracks.

### Don't need correlation (call-wide aggregates)

- **Quality outlier** — one participant materially worse than the call's median (score, loss, RTT).
  *Inputs:* per-client scores/metrics across `call.observedClients`.
- **Asymmetric media / send-receive imbalance** — a client sending far more/less than it receives
  in a way the topology doesn't explain.
- **Call-wide congestion / correlated degradation** — many clients degrade in the same window
  (points at a shared cause: SFU, region, bandwidth) vs. a single bad client.
- **TURN-reliance spike** — a jump in clients forced onto TURN/TCP (connectivity degradation).
- **Roster churn / join-fail pattern** — repeated join→leave or clients that never reach
  `client-joined`.

Each implements the existing `Detector` interface, is registered on `call-added` via
`observedCall.detectors.add(...)`, runs on `call.update()`, and raises findings with
`observedCall.addIssue(...)`. Detectors that need correlation should no-op gracefully when the
call's policy is `none` (so they're safe to register unconditionally).

---

## 4. Call-level issue handling

Today: `call.addIssue(issue)` emits `call-issue` with a `ClientIssue`-shaped payload
(`{ type, payload?, timestamp? }`); detectors call it from `update()`. Open questions and a
proposed model:

- **Transient vs. stateful.** Detectors run every tick; naively `addIssue` each tick would spam.
  *Proposal:* support both — `addIssue` for one-shot events, and an "ongoing issue" helper where a
  detector opens an issue once (keyed by a stable id), keeps it open across ticks, and closes it
  when the condition clears (emitting open/close, or a single `call-issue` with a `state`).
- **Severity.** Add an optional `severity` (`info` | `warning` | `critical`) to the issue shape so
  consumers can filter/route. Backwards compatible (optional field).
- **Accumulation & reporting.** Store open/closed call issues on the call (e.g. `call.issues`) and
  fold counts into the call report, mirroring how per-client issues are tracked.
- **Namespacing.** Server-detector issue `type`s should be namespaced (e.g. `srv:delivery-mismatch`)
  to distinguish them from client-reported `clientIssues` that surface as `client-issue`.
- **Dedup key.** An optional stable `id`/`key` on an issue so repeated raises of the same
  underlying problem coalesce instead of duplicating.

Proposed issue shape (superset, all new fields optional → non-breaking):

```ts
type CallIssue = {
  type: string;             // namespaced, e.g. 'srv:delivery-mismatch'
  severity?: 'info' | 'warning' | 'critical';
  key?: string;             // dedup/lifecycle key (e.g. `${type}:${producerId}`)
  state?: 'open' | 'closed';
  payload?: string;         // JSON
  timestamp?: number;
};
```

---

## Suggested build order

1. **Correlation core**: the `AttributeIndexedResolver` base + `p2p-ssrc` and generic `attachment`
   strategies + the `TrackCorrelationPolicy` config union (mediasoup already done). Keep it optional.
2. **Issue model**: extend the issue shape (severity/key/state) + the ongoing-issue helper on the
   call; store + report call issues.
3. **First detectors**: start with **quality outlier** (no correlation needed) and
   **producer→consumer delivery mismatch** (needs #1) — the two highest-signal ones.
4. **Derived metrics**: add incrementally as detectors/consumers need them.
