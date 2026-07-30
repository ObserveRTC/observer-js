# Track correlation (implemented), derived metrics, detectors & call-level issues

Status: **§1 (track correlation) is implemented**; §2–§4 (expanded metrics, detectors, call-issue
handling) remain **design / collection** — input for the future server-side detectors and the
`ClientSampleProcessor`.

1. **Track correlation** — *optional*, strategy-driven linking of published (outbound) tracks to
   the subscribed (inbound) tracks that carry them. **Shipped.**
2. **Expanded derived metrics** — additive only; `attachments` are never removed. *Design.*
3. **Detectors & call-level issues** — server-side detectors (several need #1) and how `call-issue`
   should behave. *Design.*

---

## 1. Track correlation (implemented)

Correlation is **opt-in** and off by default. You enable it per observer via the
`ObserverConfig.createRemoteTrackResolver` factory, which is invoked when each call is created and
returns that call's `RemoteTrackResolver` (or `undefined` for none). **`attachments` are read,
never modified.**

```ts
import { Observer, createDefaultMediasoupRemoteTrackResolverFactory } from '@observertc/observer-js';

const observer = new Observer({
  createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
});
```

### Model

`RemoteTrackResolver` is one generic class. It subscribes to the bus (filtered to its call) on
`inbound-/outbound-track-added/-removed`, and links tracks by a **publisher id** (the link key:
one publisher → many subscribers). It maintains the links **directly on the tracks**:

- `inboundTrack.remoteOutboundTrack?: ObservedOutboundTrack` — the publisher of this subscription.
- `outboundTrack.remoteInboundTracks: Set<ObservedInboundTrack>` — all subscribers of this publisher.

A strategy is just a set of resolver functions (`RemoteTrackResolvers`):

```ts
type RemoteTrackResolvers = {
  resolveInboundTrackPublisherId:  (inboundTrack)  => string | undefined;  // required (link key)
  resolveOutboundTrackPublisherId: (outboundTrack) => string | undefined;  // required (link key)
  resolveInboundTrackSubscriberId?: (inboundTrack) => string | undefined;  // optional (lookup)
};
```

The "publisher id" is whatever links the two sides — mediasoup's `producerId`, an RTP **SSRC**, or
a shared attachment value. The optional subscriber id only powers `getInboundTrackBySubscriberId`.
Ids are re-resolved on demand (no key caching). The resolver also exposes
`getOutboundTrackByPublisherId` / `getInboundTrackBySubscriberId`.

### Built-in strategy factories

| Factory | Publisher id | Subscriber id | Notes |
|---------|-------------|---------------|-------|
| `createDefaultMediasoupRemoteTrackResolverFactory()` | `attachments.producerId` | `attachments.consumerId` | 1 publisher → N subscribers (SFU) |
| `createP2pRemoteTrackResolverFactory()` | RTP **SSRC** (`getInboundRtp().ssrc` / `getOutboundRtps().map(r => r.ssrc)`) | same SSRC | SSRC is preserved end-to-end in p2p; single-encoding (simulcast would need per-encoding keys) |
| custom | your resolver functions | optional | `new RemoteTrackResolver(call, { … })` in your factory |

### Using the links

```ts
const publisher  = inboundTrack.remoteOutboundTrack;          // who is sending this
const subscribers = [ ...outboundTrack.remoteInboundTracks ]; // who is receiving this
```

These links are the inputs the cross-client detectors (§3) need. (The class also keeps thin
`resolveRemoteOutboundTrack`/`resolveRemoteInboundTracks` accessors that just read these fields.)

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

> A deeper, livecalls-stats-grounded analysis of exactly which call-level detectors are feasible
> from `ClientSample` (with the exact thresholds and what's out of scope) is in
> [`docs/call-level-detectors-analysis.md`](./call-level-detectors-analysis.md). This section is the
> summary.

All are **server-side, cross-client** — things the client can't see on its own (per-client signals
already arrive as `clientIssues`). Grouped by what they need.

### Need correlation (§1)

- **Producer→consumer delivery mismatch** — producer/outbound is healthy (sending, low loss) but
  one or more correlated consumers/inbound receive poorly (high loss/freeze/no data). Strongly
  implies an SFU/forwarding problem rather than the sender. *Inputs:* outbound health + correlated
  inbound health.
- **Dead/zombie outbound track** — an outbound track with no correlated inbound anywhere (nobody
  consuming), or producing bytes that reach no one. *Inputs:* `outboundTrack.remoteInboundTracks`.
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
`observedCall.addIssue(...)`. Detectors that need correlation should no-op gracefully when no
resolver is configured (`call.remoteTrackResolver` is `undefined`), so they're safe to register
unconditionally.

### Grounding: what `livecalls-stats` and the SFU actually do today

Investigated the two real consumers of `ClientSample`. They strongly validate the list above and
give us concrete heuristics to copy. Highlights:

**The SFU (`livecalls-sfu`)** — its single most important call-level signal is a
**producer↔consumer score mismatch**: it compares mediasoup `producerScore` vs `consumerScore`
and flags when the **producer is healthy (score ≥ 9 / 10) but the consumer is not (< 9)** — i.e.
the sender is fine but a receiver isn't getting good media → a forwarding/network problem the
client can't self-diagnose. It also detects a **consumer "stopped"** (consumer not paused, producer
not paused, but no layers/media arriving). It tracks these as **open/close transitions** ("score is
low" → "returned to normal", with a degradation timestamp) rather than per-tick spam. It also
watches **ICE state flapping** per transport (send/recv/hybrid) and ICE restarts. Notably, this
producer/consumer correlation happens *outside* the observer today (in `consuming.ts`) — which is
exactly the gap the optional correlation (§1) lets us close inside `observer-js`.

**`livecalls-stats`** — correlates clients via track `attachments` (`producerId` / `consumerId` /
`label` / `trackIdentifier`) and detects, among others:
- **dry-inbound-track** — a consumer exists but no media is flowing. Crucially it is **filtered
  against producer pause/mute** (a paused producer legitimately sends nothing) — false-positive
  suppression a detector must replicate.
- **missing consumer** — a producer was active during a participant's consuming window but that
  participant never created a consumer (with a ~1.5 s overlap tolerance for join/leave races).
- **orphan consumer** — a consumer points at a `producerId` that exists in no report.
- Per-stream **quality classification** (`good` / `degraded` / `high-jitter` / `packet-loss` /
  `freezing`) with screen-share-relaxed thresholds keyed off the track `label`.
- It also **auto-corrects clock skew** when `|offset| ≥ 5000 ms` (validates roadmap item A2).

**Concrete thresholds worth adopting as detector defaults** (from these repos):

| Signal | Threshold |
|--------|-----------|
| Healthy-vs-unhealthy score split | producer ≥ 9, consumer < 9 (on a 0–10 scale; note `observer-js` score is 0–5, so make it relative/configurable) |
| fractionLost buckets | 0.01, 0.05, 0.1, 0.2, 0.3, 0.5 |
| Inbound video freezing | freeze events > 0.5 /s |
| Inbound video/audio packet-loss | lost > 10 /s |
| Jitter (in/out) | > 100 ms |
| Inbound audio freezing | concealment > 5 /s |
| Outbound video packet-loss | nack > 15 /s, or pli+fir > 2 /s |
| Consumer-coverage overlap tolerance | ~1.5 s |
| Clock-skew auto-correct | \|offset\| ≥ 5000 ms |

**So the priority order to build** (highest signal first):
1. **Producer→consumer delivery mismatch** (needs §1 correlation) — the SFU's top signal, and the
   thing only the server sees. Must suppress when the producer is muted/paused (per stats'
   dry-track filtering).
2. **Dead/dry inbound track** (needs correlation) — consumer present, producer active & unmuted, no
   bytes/frames flowing.
3. **Quality outlier** (no correlation) — one participant materially worse than the call's peers.
4. **Orphan / missing consumer** (needs correlation) — mostly an analytics-time check; live is harder.
5. **ICE flapping / TURN-reliance spike** and **call-wide correlated degradation**.

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

1. ~~**Correlation core**~~ — **done.** `RemoteTrackResolver` + `createRemoteTrackResolver` config +
   the mediasoup and p2p factories (see §1).
2. **Issue model**: extend the issue shape (severity/key/state) + the ongoing-issue helper on the
   call; store + report call issues.
3. **First detectors**: start with **quality outlier** (no correlation needed) and
   **producer→consumer delivery mismatch** (uses §1) — the two highest-signal ones.
4. **Derived metrics**: add incrementally as detectors/consumers need them.
