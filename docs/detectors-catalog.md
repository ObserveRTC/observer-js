# Detectors catalog (master list)

Every detector idea collected so far, in one place, by **scope**. None ship yet — the `Detectors`
registry on `ObservedCall` is empty by design, and an observer-level hook is still to be added.
Detailed rationale, thresholds and sources live in the linked design docs:

- [`call-level-detectors-analysis.md`](./call-level-detectors-analysis.md) — feasibility from
  `ClientSample`, grounded in livecalls-stats.
- [`sfu-failure-detectors.md`](./sfu-failure-detectors.md) — correlated cross-client SFU-failure
  signals (with researched thresholds + citations).
- [`track-correlation-and-detectors.md`](./track-correlation-and-detectors.md) — the correlation
  mechanism the correlation-dependent detectors build on, plus the call-issue model.

**Legend.** Scope: **client** (per participant), **call** (cross-participant in one call),
**observer** (cross-call, whole SFU). Deps: *corr* = needs track correlation
(`createTrackResolver`); *obs-hook* = needs an observer-level detector hook; *classifier* = needs
the per-stream quality classifier; *issue-model* = benefits from the open/close issue lifecycle.

---

## Foundations (build these first; detectors depend on them)

| # | Building block | What it is | Status |
|---|----------------|-----------|--------|
| F1 | **Stream quality classifier** | per-stream/per-client state `good`/`degraded`/`high-jitter`/`packet-loss`/`freezing` from inbound/outbound RTP, with screen-share-relaxed thresholds; the input most call/observer detectors aggregate | not built |
| F2 | **Issue model upgrade** | extend issues with `severity`, a dedup `key`, and `open`/`close` lifecycle (so per-tick detectors don't spam); store + report call issues | not built |
| F3 | **Observer-level `Detectors` hook** | an `Observer.detectors` registry run on `observer.update()` + an `observer-issue` event, for cross-call (SFU-wide) detectors | not built |

---

## Call-level detectors (cross-participant, one call)

| # | Detector | Inputs | Condition (thresholds) | Deps | Issue type |
|---|----------|--------|------------------------|------|-----------|
| C1 | **Publisher→subscriber delivery mismatch** ★ | publisher outbound health (`remote-inbound` loss, sending) + its correlated inbound tracks' quality | publisher `good` but ≥1 subscriber `packet-loss`/`freezing` or receiving ≪ send rate; suppress if consumer paused | corr, classifier, issue-model | `srv:delivery-mismatch` |
| C2 | **Dead / dry inbound track** ★ | inbound `bytesReceived`/`framesReceived` flat; publisher liveness; pause/mute events | bytes≈0 over ~3–5 s while publisher sending & not paused/muted (suppress remote-mute) | corr | `srv:dry-inbound-track` |
| C3 | **Quality outlier** ★ | per-client quality/score/loss/RTT across `call.observedClients` | one client bad while the **majority of peers are `good`** (vs call median) | classifier | `srv:quality-outlier` |
| C4 | **Call-wide correlated degradation** | fraction of clients in a bad state in a sliding window | ≥ X% of clients `packet-loss`/`freezing` simultaneously | classifier, issue-model | `srv:call-wide-degradation` |
| C5 | **Orphan subscriber / unconsumed publisher** | correlation links + roster | inbound has a publisher id but no in-call publisher (`remoteOutboundTrack` undefined); or outbound with zero `remoteInboundTracks` while peers present | corr | `srv:orphan-subscriber` / `srv:unconsumed-publisher` |
| C6 | **Unmatched / orphan RTP stream** | inbound/outbound RTP vs correlation + tracks | an RTP with no owning track, or a track with a publisher id but no peer (from livecalls-stats `UnmatchedRtpSection`) | corr | `srv:unmatched-rtp` |
| C7 | **Reload / rejoin** | `ObservedIceCandidate.address` (remote IP) + `joinedAt`/`leftAt` across clients | consecutive clients share a remote IP with back-to-back timing (gap < ~60 s) ⇒ same browser reloaded (from `ReloadDetectionModal`) | — | `srv:client-reload` |
| C8 | **Asymmetric media / send-receive imbalance** | per-client send vs receive rates | a client sends ≫/≪ what it receives in a way the topology doesn't explain | — | `srv:media-asymmetry` |
| C9 | **One-way media** | paired tracks (correlation) | a peer pair where media flows in only one direction | corr | `srv:one-way-media` |
| C10 | **Roster churn / join-fail** | `client-joined`/`client-left`/`client-closed` | repeated join→leave, or clients that never reach `client-joined` | — | `srv:roster-churn` |

## Observer-level / SFU-wide detectors (cross-call)

These need the observer-level hook (F3); they're the differentiated, in-SFU value (see
`sfu-failure-detectors.md`). The core rule: **independent clients failing together in the same
short window share only the SFU.**

| # | Detector | Inputs | Condition (thresholds / window) | Deps | Issue type |
|---|----------|--------|---------------------------------|------|-----------|
| O1 | **ICE-disconnect storm → crash/worker-death/restart** ★ | `connectionState`/`iceConnectionState` → `disconnected`/`failed`; selected candidate-pair `packetsReceived`/`responsesReceived` flatline; DTLS state | a cluster of independent clients (same SFU, spanning ISPs/regions) disconnect within ~1–10 s; `disconnected` wave ~T+5 s, `failed` ~T+30 s; DTLS-stage failures on reconnect = restart | obs-hook, issue-model | `srv:ice-disconnect-storm` |
| O2 | **SFU egress congestion (mass layer-drop)** | consumers' inbound `frameWidth`/`frameHeight`/`framesPerSecond`/`bytesReceived` stepping down; their own `availableIncomingBitrate` healthy | majority of consumers across **multiple distinct producers** step down in the same ~1–5 s bucket | obs-hook (or call), corr | `srv:egress-congestion` |
| O3 | **SFU-wide quality collapse** | per-client quality across all calls | ≥ X% of all clients on the SFU bad in a window | obs-hook, classifier | `srv:sfu-wide-degradation` |
| O4 | **TURN-reliance spike / ICE instability** | `usingTURN`/`usingTCP`; ICE flap (`disconnected ↔ connected`) | a jump in clients forced onto TURN/TCP, or many clients flapping | obs-hook | `srv:turn-reliance-spike` / `srv:ice-instability` |

## Client-level (already covered — not server detectors)

Per-client signals — packet loss, jitter, RTT, freezes, CPU limitation, audio desync — are
detectable **on the client** and arrive on samples as `clientIssues` (surfaced as `client-issue`).
The library should not re-implement these; server-side detection focuses on what only the
server/aggregate can see (the tables above). The **F1 classifier** may still compute a per-stream
state server-side as the input to call/observer detectors.

---

## Threshold quick-reference (operational, tunable)

| Metric | Good | Degraded | Bad |
|--------|------|----------|-----|
| Packet loss (fractionLost) | < 1% / 15 s | 1–5% | > 5% |
| Jitter | < 30 ms | 30–100 ms | > 100 ms |
| RTT | < 150 ms | 150–300 ms | > 300 ms |
| MOS (1–5) | > 4.0 | 3.5–4.0 | < 3.5 |
| Inbound video freeze | freeze gap > Max(3×avg, avg+150 ms) | — | > 1 s perceptible |
| Inbound video packet-loss rate | — | — | lost > 10/s (screen-share 20/s) |
| Inbound audio freezing | — | — | conceal > 5/s |
| Forwarding stall | — | — | `bytesReceived` flat ~3–5 s while sending |
| BWE collapse | — | — | `availableOutgoingBitrate` drop > 40–50% or < Σ`targetBitrate` |
| ICE outage | — | `disconnected` ~5 s | `failed` ~30 s |

Sampling ~1 s; evaluate loss/jitter over ~15 s; correlation windows ~1–10 s. There is no standard
"% of participants bad = systemic" constant — make it configurable; start with "majority of
independent clients in the same short bucket."

## Suggested build order

1. **F1 stream-quality classifier** + **F2 issue model** (severity/key/open-close).
2. **C3 quality outlier** (no correlation — fastest win) → **C1 delivery mismatch** (the marquee,
   on correlation).
3. **F3 observer-level hook** → **O1 ICE-disconnect storm** (highest-signal SFU detector).
4. The rest (C2/C5/C6/C7, O2/O3/O4) as follow-ups.
