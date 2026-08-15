# Design notes

Background for the decisions behind observer-js. This is **not** API documentation — the
[README](../README.md) is the contract and the [CHANGELOG](../CHANGELOG.md) records what changed.
What lives here is the *reasoning*: why the library draws the line where it does, why several
plausible features were deliberately not built, and the domain facts and research those calls rest
on.

Design notes go stale faster than code. Anything here that describes behaviour should be treated as
secondary to the README; anything that describes a *judgement* should outlive any particular release.

## Contents

- [1. The division of labour](#1-the-division-of-labour)
- [2. Why each shipped detector exists](#2-why-each-shipped-detector-exists)
- [3. Deliberately not built](#3-deliberately-not-built)
- [4. Domain facts worth knowing](#4-domain-facts-worth-knowing)
- [5. Threshold reference](#5-threshold-reference)
- [6. Prior art](#6-prior-art)
- [7. Sources](#7-sources)

---

## 1. The division of labour

> **If a condition is detectable on the client, the client's issue is the source of truth.**

This one sentence decides most of what follows, so it's worth stating why it took a while to arrive
at. The obvious way to build a server-side monitor is to stream every counter to the server and
re-derive quality there — the server has all the data, after all, and it can apply consistent
thresholds across every participant.

That instinct is wrong, for three reasons:

1. **The client already did the work, better.** `client-monitor-js` detectors carry hysteresis and
   multi-signal confirmation. A server-side threshold on the same counters is a strictly worse
   version of a verdict that already arrived in the sample.
2. **Two independent verdicts on the same symptom is a bug, not redundancy.** When the client says
   "congested" and the server's own threshold disagrees, there is no principled tiebreak, and
   operators end up debugging the monitoring instead of the call.
3. **The server's real advantage isn't more data about one endpoint — it's data about all of them.**
   No browser can see the other participants. That's the whole of the differentiated value.

So observer-js answers only the questions that require the cross-participant view:

- **Who else** is in this state *right now, simultaneously*?
- **What do they share** — a publisher, a TURN server, an SFU?
- **Where in publisher → SFU → subscriber** does the fault begin?

Four metric-driven detectors violated this by re-deriving from raw counters what the client had
already concluded. They were removed — see *Every detector is issue-driven* in §2.

A consequence worth making explicit: **client-level detection is permanently out of scope.** If you
want a new symptom detected, add the detector to `client-monitor-js` and let the issue arrive here —
don't add a threshold to observer-js.

### Why the issue *lifecycle* mattered so much

Correlation needs intervals, not events. "Six clients reported congestion in the last ten seconds"
is nearly meaningless — they may have been sequential blips. "Six clients have congestion open right
now" is actionable. That distinction is the entire reason for the `client-monitor-js` ≥ 4.6.0
resolution protocol and `ObservedClient.activeIssues`; without an interval model, every cross-client
detector degrades into counting coincidences inside an arbitrary window.

---

## 2. Why each shipped detector exists

| Detector | The question no endpoint can answer |
|---|---|
| `ConcurrentIssueDetector` | Are many *independent* clients in the same state at the same moment? Independence is what makes it infrastructure rather than coincidence. |
| `IssueFanOutDetector` | Of everyone subscribed to Alice's track, how many are affected? Most → Alice's path. Exactly one → that receiver's downlink, despite the symptom being reported against Alice. |
| `TrackDeliveryMismatchDetector` | A dry track means camera-off, forwarding failure, or a wedged consumer — identical from the browser. Joining both ends separates them. |
| `SimulcastReceiverValidator` (a **validator**) | Does the SFU pick layers per receiver, or drag the publisher down to the worst one? |
| `UnconsumedTrackDetector` | Is a track being published that nobody is receiving at all? |
| `TurnServerHealthDetector` | Do the clients in trouble share a TURN server? |
| `TurnServerOutageDetector` | Did a TURN server's clients *disappear* while the rest of the fleet carried on? |
| `IceDisruptionDetector` | Did many clients lose ICE inside the same few seconds? |

Three deserve elaboration.

**`TrackDeliveryMismatchDetector`** was the surprise of the design. The original plan assumed
SFU-forwarding faults needed mediasoup instrumentation — router samples, producer/consumer scores,
the lot. They don't. The clients' own `dry-inbound-track` / `dry-outbound-track` verdicts plus the
publisher↔subscriber links are sufficient to distinguish all three cases, which means the check works
against *any* SFU, with no server integration at all. The mediasoup integration remains useful for
context and attribution, but it is not a prerequisite for the most valuable delivery check.

**`SimulcastReceiverValidator`** exists because the damage is invisible from every single
endpoint. In a correctly built SFU the RTCP feedback loop is *terminated* at the server: each
receiver's reports drive what that receiver is sent, and the publisher encodes for the server. When
the loop is relayed end to end instead, the publisher's bandwidth estimate collapses to the minimum
across all receivers, and one participant on a bad 3G link silently downgrades the stream everyone
sees. The publisher observes "my bitrate went down". Each healthy receiver observes "my video got
worse". Nobody but the server can see the causal link. It's judged as a *correlation over a window*
rather than a threshold, precisely because the signature is a relationship, not a level — and it
requires the publisher to track the worst receiver more closely than the median, so ordinary
everyone-declines-together adaptation doesn't fire it.

Naming it for simulcast rather than for RTCP termination is deliberate. Two causes produce the same
observation — no simulcast/SVC layers to hand the slow receiver, or an SFU relaying RTCP so the
publisher's estimate collapses — and the measurement cannot separate them. What the check establishes
is whether *per-receiver adaptation* happens at all, which is precisely what simulcast is for. Naming
it after one of the two mechanisms would have described half the failures.

It is a **validator** rather than a detector: this is a property of the SFU *build*, so a server doing
per-receiver selection at 09:00 still is at 17:00. Re-deriving that every tick cannot produce new
information — it only keeps a sliding window per published track alive for the life of every call. So
it is one-shot: started explicitly, runs until it can decide, reports once, and is dropped. Checking
again means starting another, which is exactly what a deploy hook should do.

The subtle part is what the *good* verdict requires. The check can only run when a publisher has
several receivers and one is far worse than the median; plenty of healthy fleets never present that.
Latching "verified" on the absence of a failure would prove nothing — the same trap as the TURN outage
control group, in a different costume. So the times the check genuinely ran are counted, and "never
tested" reports as `unknown` rather than masquerading as health. The generalisable rule: **a check
that cannot distinguish "fine" from "never ran" is not a check.**

The framework around it went through three shapes before settling, which is worth recording because
the middle one looked the most professional and was the worst. First a full `Validator` interface with
a registry, keyed verdicts for canary fleets and mapped-type config plumbing — a framework for a
category with one member. Then a single concrete class wired straight onto the `Observer`, which was
honest but gave the second validator nowhere to go. What stuck is the smallest thing that is still a
*shape*: a `Validator` interface, a name→config map that types `addValidator`, and one-shot lifecycle.
No registry class, no config slot, no revalidation timer — a deploy hook calling `addValidator` covers
what those would have.

One type trap worth remembering from that last round: `{ [K in keyof S]: S[K] }` over a discriminated
union silently collapses to the keys the members *share*, because `keyof (A | B)` is the intersection.
A report type written that way keeps `verdict` and drops every piece of evidence attached to it. Plain
`& S` is what preserves the union.

**`TurnServerOutageDetector`** exists because of a structural blind spot in its sibling. Every
issue-driven detector shares one assumption: that the clients in trouble are still *there*, still
sending samples, still attributable to the thing you want to blame. `TurnServerHealthDetector` groups
relayed clients by server and asks how many report issues — which needs clients on the server to ask.
A TURN server that fails completely violates the assumption: allocation fails, existing sessions drop,
and new clients never obtain a relay candidate through it, so they are never attributed to it at all.
Its population goes to zero and the health detector falls silent for the worst possible reason.
Degradation makes clients unhappy; **an outage makes them disappear**.

So the outage detector measures absence — a server's population against its own recent peak. Absence
is a treacherous signal, which is why the control group is not a refinement but the core of the
design: a call ending, everyone leaving at 6pm, and a fleet-wide network event produce exactly the
same collapse. The detector refuses to blame a server unless clients *not* relayed through it are
demonstrably still connected. "Everyone on `turn-eu-1` vanished" is ambiguous; "everyone on
`turn-eu-1` vanished while 200 clients elsewhere are fine" is an outage. The generalisable lesson:
**any detector whose signal is a disappearance needs a control group, or it is really just detecting
quiet.**

### Every detector is issue-driven — with one exception

The library requires `client-monitor-js` >= 4.6.0 and builds everything on the issue lifecycle. Four
metric-driven detectors (`CallWideDegradation`, `CommonSourceDegradation`, `PliAndFreezeFanOut`,
`AudioImpairmentFanOut`) were shipped, removed, briefly restored for deployments without modern
clients, and removed again. The restoration was the mistake: they applied their own thresholds to
raw counters to reach conclusions the client reaches better, so wherever clients reported issues they
produced a second finding for one condition — which is the failure mode §1 exists to prevent. The
cost of supporting old clients was paid by every user in duplicate alerts. Supporting them properly
means a client upgrade, not a worse server-side approximation.

`IceDisruptionDetector` is kept and is the exception, on a principled line: it reads a *transport
state machine*, not a quality metric. ICE state arrives in every sample regardless of what the client
runs, and transitions can occur and revert between two `update()` ticks, which a per-tick poll cannot
see — hence the one detector that subscribes to the event bus and needs `close()`.

### Scope is not a denominator

The subtlest thing in the detector set: `ConcurrentIssueDetector` runs at call and observer scope,
and those are **different questions**, not one question with a bigger population.

The first implementation treated them as the same, and it failed in both directions at once. One
thirty-person meeting where everyone is congested clears every participant threshold, so it raised a
fleet-wide alert for a single bad room the call-scoped detector had already reported. Meanwhile a
real fleet event — six broken calls out of forty — is a *small* share of all clients, so the
participant-ratio gate suppressed exactly the finding worth paging on.

The fix is that observer scope gates on **call spread** rather than participant share. Independence
is the whole signal: clients in different calls share no room, no publisher and no host, so when the
same issue opens across several of them at once, the infrastructure is the only remaining common
factor. The generalisable rule: **when you widen a detector's scope, re-derive its threshold from
what independence means at that scope — do not just enlarge the denominator.**

### Stating the conclusion, not just the correlation

`IssueConclusion` exists because "N clients have issue X and share Y" is an observation, and someone
still has to interpret it at 3am. The interpretation is stable enough to encode, and encoding it once
beats re-deriving it under pressure.

Two inputs: the issue family and the spread. Neither concludes anything alone — congestion in one
call is a meeting problem and congestion in six calls is a server problem, with an identical client
verdict in both. The case that justifies the whole module is the one where breadth *inverts* the
usual reading: `cpu-limitation` across many independent calls is **not** an SFU symptom. Endpoint CPU
is owned by the endpoint, so the same spread that implicates the server for congestion implicates a
client release, a browser version or shared VDI hardware here. That is exactly the inference an
operator gets wrong at 3am, and exactly the kind of thing a conclusion layer should hold.

---

## 3. Deliberately not built

### Out of scope because the input doesn't exist

observer-js only ever sees `ClientSample`s. These need server-side data it cannot obtain, and no
amount of cleverness closes the gap:

- Router / pipe-transport verification.
- True consumer-coverage checking (a proper `MissingConsumer`), which needs the SFU's
  `createdAt`/`closedAt` per consumer with ~1.5 s overlap tolerance. Only approximable from client
  events, so `UnconsumedTrackDetector` covers the tractable half.
- Recorder-service health and server-side recording coverage.

### Rejected

- **Detectors that are opt-in by default.** Until 1.0 both registries shipped empty. That made the
  library safe and useless in equal measure: `new Observer()` detected nothing, and every user had to
  read the detector catalogue before getting any value. Detectors are now created from config and on
  by default, with `null` as the explicit opt-out — the same contract as `client-monitor-js`, so the
  two halves of a deployment are configured the same way. This only works because every detector is
  debounced and threshold-guarded; a quiet system must stay quiet, and there is a test asserting
  exactly that.

- **A server-side stream quality classifier** (`good` / `degraded` / `high-jitter` / `packet-loss` /
  `freezing`, with a threshold table and screen-share relaxation). This was the intended foundation
  for everything else, and it's exactly what §1 rules out. Replaced by a binary
  degraded-plus-reasons model in the aggregators, with the verdicts themselves coming from client
  issues.
- **A server-side issue lifecycle helper** (`severity`, `state: 'open' | 'closed'`, a `call.issues`
  store). Superseded: the lifecycle is *received* from the client rather than synthesized here. Only
  `key` landed, on `ClientIssue`.
- **Report generation inside the Observer.** Removed, and not coming back in that form. The old
  design coupled report building to the hot path, hardcoded bucket boundaries, duplicated counter
  state, had an inconsistent lifecycle (client reports continuous, track reports only on removal),
  and baked in one non-extensible schema. Two alternatives were also rejected: a lazy `getReport()`
  (removes hot-path cost but still bakes schema and buckets into core) and pluggable report builders
  (configurable shape, but still runs in the hot path and keeps reporting coupled to observation).
  The intended replacement is snapshots as the primitive plus opt-in collectors outside core.
- **Interval-based update policies and the internal timer.** Removed for determinism — offline
  replay of a recorded sample stream must produce identical results, which a wall-clock timer
  prevents. Applications call `update()` themselves.
- **A `srv:` issue-type namespace.** Shipped detectors use `SCREAMING_SNAKE_CASE` constants.

### Deferred, with reasons

Not built, not rejected — reasonable future work:

- **`ClientSampleProcessor`** — a pipeline of decoding/normalisation/enrichment stages. Deliberately
  a *wrapper* around `accept()` rather than logic inside it, so the core stays a pure state machine;
  decoding stays outside it too.
- **Clock-skew normalisation** as a middleware. Partially mooted: `IssueIndex` already sidesteps
  the problem by measuring onset spread on the observer clock. A normalisation stage would still help
  anything that needs client timestamps to be comparable across machines.
- **`createSnapshot()` / collectors** — the report-generation replacement above.
- **Batch replay** (`processSamples()`) for offline analysis of recorded streams.
- **A protobuf sink** alongside the JSONL one.
- **Reload / rejoin chain detection** — inherently post-hoc, so low value live.
- **Simulcast-aware detection.** The p2p resolver keys on SSRC, which is preserved end to end but is
  single-encoding; simulcast needs per-encoding keys.

---

## 4. Domain facts worth knowing

Non-obvious things that shaped the implementation, collected because they're expensive to rediscover.

**mediasoup transports are ICE-Lite** — the server only answers binding requests, never initiates.
A dead worker therefore stops answering for *every* transport on it at once, producing a synchronized
disconnect wave. That synchronization is what makes cross-client ICE correlation a server-failure
fingerprint rather than a coincidence.

**ICE consent timing:** binding requests every ~5 s; `connected → disconnected` about 5 s after the
first unanswered check; `disconnected → failed` about 30 s. These are implementation-defined, not a
W3C guarantee. The signal isn't either transition — it's the two waves arriving *together* across
clients at T+5 s and T+30 s.

**Restart vs. transient outage:** on reconnect, a wave of DTLS-stage failures and new-fingerprint
handshakes (rather than pure ICE consent loss) means the process was restarted or replaced — the
clients' old DTLS association is dead.

**A PeerConnection does not relay remote mute.** A paused producer or consumer legitimately sends
nothing, so any dry-track detection must carry an explicit ignore set. This is the single most
important false-positive trap in the library.

**Stall discrimination:** bytes flat *and* frames flat is a forwarding stall; `bytesReceived` rising
while `framesDecoded` stays flat is decode or keyframe starvation. Same symptom shape, different
fault.

**mediasoup egress allocation:** a transport's `availableOutgoingBitrate` is distributed across its
consumers, and the lowest-priority layers drop first. So prioritized layer-drops across *many
distinct producers* is the egress-shortfall fingerprint — whereas one publisher's uplink congestion
shows up as `qualityLimitationReason === 'bandwidth'` on that single sender and degrades that source
everywhere.

**`consumer.score` carries `producerScore`**, which is the cleanest per-stream uplink-vs-downlink
decomposition available; a score of `0` means RTP inactivity. Mind the scale mismatch: SFU scores are
0–10 (healthy ≥ 9) while observer-js scores are 0–5, so any ported threshold must be relative or
configurable.

**RTT must be interval-averaged** — `Δ totalRoundTripTime / Δ roundTripTimeMeasurements`, never the
instantaneous value.

**Never blend ICE RTT with RTCP RTT.** ICE/STUN RTT terminates at the SFU; RTCP RTT is end to end.
Averaging them produces a number that moves as streams come and go for reasons unrelated to the
network. Their *difference* is the useful quantity — it estimates everything past the SFU. Hence the
separate `iceRttInMs`, `rtcpRttInMs` and `sfuHopRttInMs`.

**Counter resets:** Chrome resets an SSRC's cumulative counters on a codec switch
([crbug/webrtc/5361](https://bugs.chromium.org/p/webrtc/issues/detail?id=5361)). Without
`counterResetBoundary`, a room-wide codec rollout would fire a synchronized fake alert that looks
exactly like an infrastructure event.

**Counters start at zero, so `0` is a valid baseline.** Truthiness guards on delta computation
(`if (previous && …)`) silently discard the first interval of every stream — which is where the first
freeze, loss burst or PLI storm lives. Use explicit `!== undefined` checks.

**Clock skew:** livecalls-stats auto-corrects when `|offset| ≥ 5000 ms`. The corollary is implemented
in `IssueIndex`: onset spread must be measured on the observer clock, because inter-machine skew
would otherwise look exactly like a synchronized infrastructure event.

**Index the interesting minority, don't scan the majority.** Two detectors were rewritten this way
and both went from "cost scales with the deployment" to "cost scales with what's wrong":
`IssueIndex` for open client issues, and `call.unconsumedOutboundTracks` for published tracks with no
subscriber. The pattern is the same each time — the answer only changes at specific, observable
moments (an issue opens/closes, a track gains its first or loses its last subscriber), so maintain the
set there and let the detector read it. A healthy system then pays a `size === 0` check. Note the
one-off framing that makes this obvious: a monitoring system's hot path should be proportional to the
*problems*, not to the *traffic*.

**Summarize with percentiles, never means.** One participant at 1500 ms RTT hides nine healthy ones
in an average.

**Cadence:** sample ~1 s; evaluate loss and jitter over ~15 s; burst loss over 200 ms; MOS every
3–5 s; correlation windows 1–10 s.

**There is no standard "% of participants bad ⇒ systemic" constant** anywhere in the literature. It
has to be configurable. Start with "a majority of independent clients in the same short bucket".

---

## 5. Threshold reference

Operational, not spec-mandated. Collected from vendor documentation and production experience; every
detector takes these as configuration rather than baking them in.

| Metric | Good | Degraded | Bad |
|--------|------|----------|-----|
| Packet loss (fractionLost, over 15 s) | < 1% | 1–5% | > 5% (MS "poor" > 10%) |
| Jitter | < 30 ms | 30–100 ms | > 100 ms |
| RTT (`remote-inbound-rtp.roundTripTime`) | < 150 ms | 150–300 ms | > 300 ms (MS "poor" > 500 ms) |
| MOS (1–5) | > 4.0 | 3.5–4.0 | < 3.5 |
| Video freeze | none | — | inter-frame gap > `Max(3×avg, avg+150 ms)`; > 1 s perceptible |
| Congestion | — | — | `qualityLimitationReason === 'bandwidth'` AND `avgRTT − ewmaRTT > 50 ms`; resolved below 30 ms |
| BWE collapse | — | — | `availableOutgoingBitrate` drops > 40–50% within a few seconds, or falls below `sum(targetBitrate)` |

Per-stream signals, derived from livecalls-stats production tuning:

| Signal | Threshold |
|--------|-----------|
| Healthy/unhealthy score split | producer ≥ 9, consumer < 9 (0–10 scale; observer-js is 0–5, so keep it relative) |
| fractionLost buckets | 0.01, 0.05, 0.1, 0.2, 0.3, 0.5 |
| Inbound video freezing | freeze events > 0.5 /s |
| Inbound video/audio packet loss | lost > 10 /s |
| Jitter (in/out) | > 100 ms |
| Inbound audio freezing | concealment > 5 /s |
| Outbound video packet loss | NACK > 15 /s, or PLI+FIR > 2 /s |
| Consumer-coverage overlap tolerance | ~1.5 s |
| Clock-skew auto-correct | \|offset\| ≥ 5000 ms |

---

## 6. Prior art

Surveyed while designing the detectors, and the basis for the claim that the cross-participant
verdict is the gap worth filling.

- **ObserveRTC** — the closest model. `client-monitor-js` detectors (`congestion`, `cpu-limitation`,
  `audio-desync`, stuck-track) emit a score plus structured `scoreReasons`; `sfu-monitor-js` matches
  SFU RTP pads to client streams to split the path into publisher uplink / SFU / subscriber downlink.
- **mediasoup** — `consumer.score` carrying `producerScore` (see §4).
- **Twilio Video Insights** — tags a room degraded if *any* participant is bad (loss ≥ 5%, RTT >
  300 ms). That's an OR across participants, not a correlated-cause inference.
- **Janus** — emits `slow_link` at > 8 NACK/s per direction.
- **LiveKit / Daily / Jitsi / Cloudflare** — expose the signals (LiveKit and Daily use rtcscore MOS)
  but leave the "it's the server" verdict to operators.

**Takeaway:** an automated *"many independent clients degraded simultaneously ⇒ it's the SFU"*
verdict is essentially absent from shipped tooling. Everyone surfaces the per-participant signals;
nobody draws the cross-participant conclusion. That gap is what observer-js is for.

---

## 7. Sources

- webrtcHacks — *Power-up getStats for Client Monitoring* (Balázs Kreith):
  https://webrtchacks.com/power-up-getstats-for-client-monitoring/
- Mozilla — *ICE: disconnected or not* (consent timing):
  https://blog.mozilla.org/webrtc/ice-disconnected-not/
- W3C — *Identifiers for WebRTC's Statistics API* (freeze definition, field semantics):
  https://www.w3.org/TR/webrtc-stats/
- MDN — `iceConnectionState`, `connectionState`, `RTCDtlsTransport.state`,
  `RTCIceCandidatePairStats`, `qualityLimitationReason`, `availableOutgoingBitrate`
- Chromium — [crbug/webrtc/5361](https://bugs.chromium.org/p/webrtc/issues/detail?id=5361), codec-switch
  counter reset
- mediasoup — RTC Statistics, ConsumerScore / ProducerScore:
  https://mediasoup.org/documentation/v3/mediasoup/rtc-statistics/
- Microsoft Teams good/poor thresholds and 15 s / 200 ms windows:
  https://tomtalks.blog/what-are-thresholds-for-good-and-poor-network-packet-loss-jitter-and-round-trip-time-for-unified-communications/
- MOS / E-model: https://www.webrtc-developers.com/how-to-calculate-mos/ ·
  rtcscore: https://github.com/ggarber/rtcscore · https://thinhdanggroup.github.io/webrtc-mos/
- 100ms — *Measuring WebRTC call quality*:
  https://www.100ms.live/blog/measuring-webrtc-call-quality-part-1
- Twilio Video Insights: https://www.twilio.com/docs/video/troubleshooting/insights
- RFC 7675 — ICE consent freshness · IETF `rmcat-gcc` — GCC / transport-cc
