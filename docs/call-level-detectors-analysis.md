# Analysis: call-level detectors (grounded in livecalls-stats)

What call-level (cross-participant) detectors should `observer-js` add? This analysis is grounded
in what **livecalls-stats** actually derives and exposes from `ClientSample` stats, mapped to what
`observer-js` can compute from the same input.

## What `observer-js` has to work with

A detector runs **live** on `call.update()` and may use:

- **Per-stream / per-client metrics** already derived from `ClientSample`: byte/packet deltas,
  bitrates, RTT, jitter, fractionLost, and the **remote-RTP correlation** (`remote*` fields linking
  a local stream to the far side's RTCP report).
- **Track correlation** (optional, via `ObserverConfig.createTrackResolver`): publisher→subscriber
  links exposed as `inboundTrack.remoteOutboundTrack` and `outboundTrack.remoteInboundTracks`.
- **Client events** (`clientEvents[]`): `PRODUCER_PAUSED/RESUMED`, `CONSUMER_PAUSED/RESUMED`,
  `MEDIA_TRACK_MUTED/UNMUTED`, `CLIENT_JOINED/LEFT`, ICE/PC state changes — essential for
  false-positive suppression (a paused producer legitimately sends nothing).
- **The whole call**: `call.observedClients` → every participant's streams, for cross-participant
  comparison.

Crucial boundary: `observer-js` only sees **`ClientSample`s**. It does **not** have the SFU's
server-side reports (producer/consumer/transport lifetimes, router/pipe mappings). So the
livecalls-stats checks built on those (router verification, server-window consumer coverage) are
**out of scope** here (see bottom).

## livecalls-stats call-level signals → feasibility here

| livecalls-stats signal | What it needs | Feasible from `ClientSample` (+correlation)? |
|------------------------|---------------|----------------------------------------------|
| Quality classification (good/degraded/high-jitter/packet-loss/freezing) | per-stream RTP fields | ✅ yes — foundation, see below |
| Producer↔consumer **health mismatch** (SFU score compare) | publisher + subscriber health | ✅ yes, with track correlation |
| `dry-inbound-track` (consumer, no media) + producer-paused suppression | inbound bytes/frames + pause events | ✅ yes |
| `OrphanConsumer` (consumer → non-existent producer) | correlation + roster | ✅ approx (inbound has a publisher id but no matching publisher in-call) |
| `MissingConsumer` (producer active in a participant's consuming window, no consumer) | **server transport lifetimes** | ⚠️ partial — only approximate from client events; full check needs SFU data |
| Reload chains (consecutive participants share remote IP) | ICE candidate IPs + join/leave times | ⚠️ possible from `iceCandidates` addresses, but post-hoc; low value live |
| Router/pipe mapping verification (cross-SFU) | **SFU router reports** | ❌ out of scope (no `ClientSample` input) |

## Foundation to build first: a per-stream quality classifier

Almost every call-level detector is "compare/aggregate per-stream quality across participants," so
the reusable primitive is a **stream quality state** — exactly what livecalls-stats computes. Adopt
its states and thresholds (rates are per-second; suppress to `good` while the producer/consumer is
paused or the track muted):

States, worst-first: `freezing` > `packet-loss` > `high-jitter` > `degraded` > `good`.

| Direction / kind | freezing | packet-loss | high-jitter | degraded |
|------------------|----------|-------------|-------------|----------|
| inbound video | freeze > 0.5/s | lost > 10/s | jitter > 100ms | lost > 3/s or dropped > 3/s |
| inbound audio | conceal > 5/s | lost > 10/s | jitter > 100ms | lost > 3/s or conceal > 2/s |
| outbound video | fps→0 (after >0) | (pli+fir) > 2/s or nack > 15/s | remote jitter > 100ms | nack > 5/s or dropped > 3/s |
| outbound audio | — | nack > 10/s | remote jitter > 100ms | nack > 4/s |

Screen-share (by track `label`) uses **relaxed** thresholds (e.g. inbound video packet-loss at
lost > 20/s, high-jitter at 150ms). This classifier is per-stream/per-client; it is **not itself a
call-level detector** — it's the input the ones below consume. (It could live as a small helper or
as derived fields; see the "expanded metrics" item in the roadmap.)

## Proposed call-level detectors (prioritized)

### 1. Publisher→subscriber delivery mismatch  ★ highest signal · needs correlation

The server-only signal: a **published (outbound) track is healthy** — sending bytes, low
`remoteFractionLost`, good outbound quality state — but **one or more correlated subscribers
(inbound) are not** (`freezing`/`packet-loss`, or near-zero received bytes). Strongly implies an
SFU/forwarding/network problem on the delivery path, not the sender.

- **Inputs:** `outboundTrack` health (bytes sent, `remote*` loss/rtt, outbound quality state) +
  `outboundTrack.remoteInboundTracks` each subscriber's inbound quality / received-byte rate.
- **Condition:** publisher state `good` AND ≥1 subscriber `packet-loss`/`freezing` (or receiving
  ≪ the publisher's send rate). Mirrors the SFU's "producerScore healthy, consumerScore low".
- **Suppress when:** the subscriber's consumer is paused, or the participant is mid-join/leave.
- **Issue:** `srv:delivery-mismatch`, payload `{ publisher, affectedSubscribers[] }`.

### 2. Dead / dry inbound track  ★ · needs correlation (or roster)

A subscribed (inbound) track receiving **~0 bytes/frames** while its publisher is **active and
unmuted**. Maps to livecalls-stats `dry-inbound-track`.

- **Inputs:** inbound received-byte/packet rate; publisher liveness (`remoteOutboundTrack` sending);
  `CONSUMER_PAUSED`/`PRODUCER_PAUSED` + track `muted`.
- **Condition:** inbound delta bytes ≈ 0 over N ticks AND publisher is sending AND not paused/muted.
- **Suppress when:** producer/consumer paused or track muted (the explicit false-positive filter
  livecalls-stats applies).
- **Issue:** `srv:dry-inbound-track`.

### 3. Quality outlier  ★ · no correlation needed

One participant materially worse than the call's peers — the "who is the problem" question.

- **Inputs:** per-client aggregate (worst/most-common stream quality state, score, avg RTT,
  loss) across `call.observedClients`.
- **Condition:** a client is `packet-loss`/`freezing` (or score / loss far from the call median)
  while the **majority of peers are `good`** → it's that client's problem, not the call's.
- **Issue:** `srv:quality-outlier` (per affected client).

### 4. Call-wide correlated degradation  · no correlation needed

The inverse of #3: **many** participants degrade in the same window → a shared cause (SFU, region,
bandwidth) rather than one bad client.

- **Inputs:** fraction of clients in a bad state within a sliding window.
- **Condition:** ≥ X% of clients `packet-loss`/`freezing` simultaneously.
- **Issue:** `srv:call-wide-degradation`.

### 5. Orphan / unconsumed publisher  · needs correlation

- **Orphan subscriber:** an inbound track resolves a publisher id but no matching publisher exists
  in the call (`remoteOutboundTrack` stays `undefined` though a publisher id was present). Maps to
  `OrphanConsumer`.
- **Unconsumed publisher:** an outbound track with **zero** `remoteInboundTracks` while other
  participants are present and joined — nobody is receiving it. Approximates `MissingConsumer`
  (without the SFU's transport-window precision).
- **Issue:** `srv:orphan-subscriber` / `srv:unconsumed-publisher`.

### 6. TURN-reliance spike / ICE instability  · no correlation needed

Cross-client connectivity health: a jump in clients on TURN/TCP, or repeated ICE
disconnect↔connect flapping. (`observer-js` already tracks `usingTURN`/`usingTCP` and ICE state.)

- **Issue:** `srv:turn-reliance-spike` / `srv:ice-instability`.

## Out of scope (need SFU server reports, not `ClientSample`)

These livecalls-stats checks rely on server-side data `observer-js` never receives, so they belong
in the SFU or the stats backend, not here:

- **Router / pipe-transport verification** (cross-SFU): unpaired/duplicate mappings, pipe
  producer/consumer pairing, lifetime mismatch (5s tolerance), missing pipe coverage.
- **Server-window consumer coverage** (`MissingConsumer` proper): needs producer/consumer/transport
  `createdAt`/`closedAt` from the SFU (1.5s overlap tolerance, `camera-hq` exclusion).
- **Recorder-service health** (archive chunks, watchdog timeouts, producer swaps): from
  `recorderServiceStats` extension stats — app-specific, better handled by the app.

## Build order

1. **Stream quality classifier** (foundation; per-stream state with the thresholds above).
2. **Issue model** upgrade (severity + stable `key` + open/close lifecycle — validated by the SFU's
   "low → returned to normal" transitions; see `track-correlation-and-detectors.md` §4).
3. **Detector #3 (quality outlier)** — no correlation, immediate value.
4. **Detector #1 (delivery mismatch)** — the marquee server-side detector, on top of correlation.
5. #2, #4, #5, #6 as follow-ups.
