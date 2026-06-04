# SFU-failure detectors (from client stats)

When `observer-js` runs **inside an SFU** it ingests `ClientSample`s from *every participant of
every call*. That vantage point makes a class of **server-side failure** detectable that no single
client can see: the discriminator is **correlation across independent clients**. One client losing
ICE or spiking packet loss is its own network; **many independent clients (different users,
networks, ISPs, geos) degrading within the same short window share only one thing — the SFU** — so
the server crashed, a worker died, or its egress/uplink saturated.

These are **observer-level** detectors (cross-call, across the whole SFU) and **call-level**
detectors (across one call's participants). They complement the per-client `clientIssues` that
already arrive on samples.

> Design note: the `Detectors` registry currently lives on `ObservedCall`. SFU-wide detectors need
> an **observer-level** hook (an `Observer.detectors` registry run on `observer.update()`, or the
> app subscribing to the bus and aggregating). Adding the observer-level detector hook is a
> prerequisite for #1, #4, #5 below.

## The correlation principle (the core heuristic)

- **Bucket per-client signals by time.** A spike of the same failure across N independent clients
  in a window of seconds, all pointing at the same SFU node/endpoint, is the server-failure
  fingerprint. Isolated, time-scattered failures are client-local.
- **Strengtheners:** the correlated clients span multiple ISPs / regions / candidate types
  (UDP+TCP+TURN all fail together rules out a single last-mile or firewall).
- **Score-with-reasons.** Emit issues with a structured reason (like ObserveRTC's `scoreReasons:
  Record<string, number>`) so downstream can classify *why*.

---

## Prioritized detectors

### 1. ICE-disconnect storm → SFU crash / worker death / restart  ★ observer-level

The highest-signal server-failure detector.

- **Inputs (per client):** peer-connection `connectionState` / `iceConnectionState` transitions to
  `disconnected` then `failed`; faster/earlier — the **selected ICE candidate-pair**
  (`nominated`/`succeeded`) whose `packetsReceived`/`responsesReceived` **flatline** while
  `requestsSent` keeps climbing (consent requests going unanswered). `observer-js` already tracks
  ICE state and the selected candidate pair.
- **Correlation rule:** ≥ a meaningful share of clients **on the same SFU** enter
  `disconnected`/`failed` (or their selected-pair packets flatline) within the **same ~1–10 s
  window**. Because mediasoup transport is **ICE-Lite** (server only answers binding requests), a
  dead worker stops answering for *every* transport on it at once → a synchronized wave.
- **Timing (consent freshness, RFC 7675 / browser behavior):** binding requests every ~5 s;
  `connected → disconnected` ≈ **5 s** after first unanswered check; `disconnected → failed` ≈
  **30 s** total. Expect a `disconnected` wave at ~T+5 s and, if the server stays down, a `failed`
  wave at ~T+30 s — the **synchronization of the two waves** is itself the signal.
- **Restart vs transient:** on reconnect, a wave of **DTLS-stage** failures / new-fingerprint
  handshakes (vs pure ICE-consent loss) confirms a *restarted/replaced* process (clients’ old DTLS
  association is dead).
- **Don't** alarm on a single client's `disconnected` (it self-heals); only the cross-client
  cluster upgrades it to a confident server-outage signal.
- **Issue:** `srv:ice-disconnect-storm` (observer-level), payload `{ affectedClients, windowMs, sfu }`.
  Sources: Mozilla ICE consent timing (blog.mozilla.org/webrtc/ice-disconnected-not), MDN
  `iceConnectionState`/`connectionState`/`RTCDtlsTransport.state`, webrtcHacks getStats monitoring,
  mediasoup ICE-Lite + Worker `died`.

### 2. Forwarding stall / dry inbound track  ★ call-level (→ observer when widespread)

- **Inputs:** inbound-rtp `bytesReceived` (and `framesReceived`) **flat** while the publisher is
  known to be sending and the consumer/track is **not paused/muted**. Distinguish:
  both bytes **and** frames flat = forwarding stall; `bytesReceived` rising but `framesDecoded`
  flat = decode/keyframe starvation (not a forwarding stall).
- **Threshold/window:** flat for ~**3–5 s** (ObserveRTC `client-monitor` default
  `minStuckedDurationInMs: 3000`). **Must** suppress when the producer/consumer is paused/muted
  (PeerConnection doesn't relay remote mute — keep an ignore set), the explicit false-positive trap.
- **Correlation:** many consumers of the **same publisher** stall together → that producer's SFU
  forwarding; many consumers of **many** publishers stall together → SFU-wide (escalate to #1/#4).
- **Issue:** `srv:forwarding-stall` / `srv:dry-inbound-track`.
  Source: webrtcHacks "Power-up getStats" (Balázs Kreith); W3C freeze definition.

### 3. Publisher healthy, subscribers degrade  ★ call-level · needs correlation

- **Inputs:** the publisher's outbound health is good — its `remote-inbound-rtp.fractionLost` low,
  still sending — **but** its correlated inbound tracks (`outboundTrack.remoteInboundTracks`) show
  high loss / freezes / falling bitrate. Mirrors mediasoup `producer_score ≈ 10` while a
  `consumer.score` drops → the SFU→consumer leg, not the source.
- **Correlation:** uses the track resolver (publisher→subscriber links). If **all** of a producer's
  consumers degrade → producer uplink/ingest; if a **subset** → those subscribers' downlinks; if
  consumers across **many** producers degrade → SFU egress (#4).
- **Issue:** `srv:delivery-mismatch` (already the marquee detector in the catalog).
  Sources: mediasoup ConsumerScore/ProducerScore; rtcbits SFU packet-loss feedback.

### 4. SFU egress congestion → mass simulcast/SVC layer-drop  ★ observer/call-level

- **Inputs (receiver side, across consumers):** inbound-rtp `frameWidth`/`frameHeight` and
  `framesPerSecond` stepping **down**, `bytesReceived` rate falling — **while each affected client's
  own downlink is healthy** (their `candidate-pair.availableIncomingBitrate` not saturated, their
  own `outbound-rtp` fine).
- **Correlation rule (the discriminator):** a **majority of consumers on one SFU, spanning multiple
  distinct producers**, step down resolution/fps/bitrate within the same ~1–5 s bucket. mediasoup
  distributes a transport's `availableOutgoingBitrate` across consumers and drops layers
  (lowest-priority first) when egress can't satisfy everyone — so prioritized layer-drops across
  many consumers is the egress-shortfall fingerprint. Contrast with **one publisher's uplink
  congestion**, which shows as `outbound-rtp.qualityLimitationReason === 'bandwidth'` on that *one*
  sending client and degrades only that source everywhere.
- **Issue:** `srv:egress-congestion`.
  Sources: MDN `availableOutgoingBitrate`/`qualityLimitationReason`/`qualityLimitationDurations`;
  LiveKit/mediasoup simulcast + BWE allocation; GCC/transport-cc (IETF rmcat-gcc).

### 5. Call-/SFU-wide quality collapse  · observer-level

- **Inputs:** per-client quality state / score (loss, jitter, RTT, freezes, MOS). Use the
  **stream-quality classifier** as the per-client primitive.
- **Correlation:** fraction of clients in a bad state within a sliding window exceeds a threshold —
  across one call (call-wide cause) or across the whole observer (SFU/region/infra cause), vs. a
  single outlier client (#quality-outlier).
- **Issue:** `srv:call-wide-degradation` / `srv:sfu-wide-degradation`.

### 6. ICE flapping / TURN-reliance spike  · observer/call-level

- A jump in clients forced onto TURN/TCP (`usingTURN`/`usingTCP`), or repeated
  `disconnected ↔ connected` flapping, across many clients → connectivity degradation at/near the
  SFU. `srv:turn-reliance-spike` / `srv:ice-instability`.

---

## Threshold & window reference (operational, not spec-mandated)

| Metric | Good | Degraded | Bad |
|--------|------|----------|-----|
| Packet loss (fractionLost) | < 1% (over 15 s) | 1–5% | > 5% (MS "poor" > 10%) |
| Jitter | < 30 ms | 30–100 ms | > 100 ms |
| RTT (`remote-inbound-rtp.roundTripTime`) | < 150 ms | 150–300 ms | > 300 ms (MS "poor" > 500 ms) |
| MOS (1–5) | > 4.0 | 3.5–4.0 | < 3.5 |
| Video freeze | none | — | inter-frame gap > Max(3×avg, avg+150 ms); > 1 s perceptible |
| Congestion (Kreith) | — | — | `qualityLimitationReason==='bandwidth'` AND (avgRTT − ewmaRTT) > 50 ms; resolved < 30 ms |
| BWE collapse | — | — | `availableOutgoingBitrate` drops > 40–50% in a few s, or < sum(`targetBitrate`) |

- **Sampling:** poll/derive per ~1 s (counter deltas); evaluate loss/jitter over ~15 s windows
  (Microsoft), burst loss over 200 ms; compute MOS every 3–5 s. Use interval-average RTT
  (`Δ totalRoundTripTime / Δ roundTripTimeMeasurements`), not instantaneous.
- **ICE outage windows:** ~5 s to `disconnected`, ~30 s to `failed` (implementation-defined, not a
  W3C guarantee).
- **No standard "% of participants bad = call-wide" constant exists** in the literature — it's a
  tunable. Start with "majority of independent clients in the same short bucket," make it
  configurable.

## Prior art (what others do)

- **ObserveRTC** — the closest model: `client-monitor-js` detectors (`congestion`, `cpu-limitation`,
  `audio-desync`, stuck-track) emit a score + `scoreReasons`; `observer-js` aggregates to
  `call.score`/`client.score`; `sfu-monitor-js` matches SFU RTP pads to client streams to split the
  path (publisher uplink / SFU / subscriber downlink).
- **mediasoup** — `consumer.score` carries `producerScore` → the cleanest per-stream "uplink vs
  downlink" decomposition; score `0` = RTP inactivity (stall).
- **Twilio Video Insights** — tags a room degraded if *any* participant is bad (loss ≥ 5%, RTT >
  300 ms); an OR, not a correlated-cause inference. **LiveKit/Daily/Jitsi/Janus/Cloudflare** expose
  the signals (LiveKit/Daily use rtcscore MOS; Janus `slow_link` at > 8 NACK/s per direction) but
  leave the "it's the server" verdict to operators.
- **Takeaway:** an automated *"many independent clients bad simultaneously ⇒ SFU"* verdict is
  essentially **absent** in shipped tools — it's the differentiated value an in-SFU `observer-js`
  detector can provide.

### Sources

- webrtcHacks — *Power-up getStats for Client Monitoring* (Balázs Kreith): https://webrtchacks.com/power-up-getstats-for-client-monitoring/
- Mozilla — *ICE: disconnected or not* (consent timing): https://blog.mozilla.org/webrtc/ice-disconnected-not/
- MDN — `iceConnectionState`, `connectionState`, `RTCDtlsTransport.state`, `RTCIceCandidatePairStats`, `qualityLimitationReason`, `availableOutgoingBitrate`
- W3C — *Identifiers for WebRTC's Statistics API* (freeze definition, fields): https://www.w3.org/TR/webrtc-stats/
- mediasoup — RTC Statistics & ConsumerScore/ProducerScore: https://mediasoup.org/documentation/v3/mediasoup/rtc-statistics/
- Microsoft Teams good/poor thresholds + 15 s/200 ms windows: https://tomtalks.blog/what-are-thresholds-for-good-and-poor-network-packet-loss-jitter-and-round-trip-time-for-unified-communications/
- MOS / E-model: https://www.webrtc-developers.com/how-to-calculate-mos/ · rtcscore: https://github.com/ggarber/rtcscore , https://thinhdanggroup.github.io/webrtc-mos/
- 100ms thresholds + windows: https://www.100ms.live/blog/measuring-webrtc-call-quality-part-1
- Twilio Video Insights: https://www.twilio.com/docs/video/troubleshooting/insights · Janus slow_link, LiveKit/Daily quality docs (see research notes)
