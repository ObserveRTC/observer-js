# Examples

Runnable examples. They use synthetic samples, so they work standalone — no SFU, no browsers.

```bash
yarn example              # sfu-observer.ts — the end-to-end tour
yarn example:detectors    # detectors.ts    — every detector, one scenario each
```

| File | Read it for |
|------|-------------|
| [`sfu-observer.ts`](./sfu-observer.ts) | How the pieces fit together: ingest → correlate → react, plus the mediasoup wiring. Start here. |
| [`detectors.ts`](./detectors.ts) | The reference. Each built-in detector with the question it answers, its full config, a scenario that makes it fire, and the finding it produces. |

## `sfu-observer.ts`

The whole path in one file: ingest client samples → correlate across participants → run detectors →
react to findings, with the mediasoup wiring shown alongside.

The scenario is a three-subscriber call where the publisher keeps sending while every receiver stops
getting media — the signature of a forwarding fault. The detectors reach it in three steps, which is
a good illustration of how they layer:

```
ISSUE_ONSET_BURST              3 of 4 clients degraded within ~1ms of each other
PUBLISHED_TRACK_ISSUE_FAN_OUT  …and it follows Alice's track, whose publisher looks healthy
PUBLISHED_TRACK_NOT_DELIVERED  …she is demonstrably sending (300 packets, 2.9 Mbps) and nobody
                               receives it → the forwarding path, not the source, not the receivers
```

Note what is **not** printed: no `[sfu-wide]` finding. `CallConcurrentIssueDetector` has an
`ObserverConcurrentIssueDetector` sibling that runs at observer scope, but that one requires the
affected clients to span at least two *independent* calls before concluding anything — and this demo
has one. That is the point of the gate: one bad meeting is the call-scoped detector's business, and
raising a fleet alert for it would be a false positive. Feed a second call with the same issue open
and `CROSS_CALL_ISSUE_ONSET_BURST` appears, carrying a `conclusion` of `faultDomain: 'infrastructure'`.

Three details in the file worth copying into real integrations:

- **Detectors are opt-in, not implicit.** A fresh `Observer` starts with zero detectors. The example
  calls `observer.addCallDetector(name, config)` for the call-scoped ones (built onto every call the
  observer creates from then on; `observedCall.addDetector(...)` does the same for a single call) and
  would use `observer.addObserverDetector(name, config)` for cross-call ones. A detector only sees the
  issue types named in its `issueTypes` config — there is no "watch everything" option.

- **`clientIssues[].key`** ties an issue raise to its `<type>-resolved` companion, which is what lets
  the observer track episodes as intervals instead of points in time.
- **A media source is required** for an outbound track to resolve its RTP streams
  (`mediaSource.trackIdentifier` → `outboundRtp.mediaSourceId`). Omit it and "is the publisher
  sending?" reads as *no*, which flips the delivery verdict.

## `detectors.ts`

One scenario per detector, each raising exactly one finding so it is unambiguously attributable:

| # | Detector | Scenario | Raises |
|---|----------|----------|--------|
| 1 | `CallConcurrentIssueDetector` | 3 of 4 participants congested at once | `ISSUE_ONSET_BURST` |
| 2 | `ObserverConcurrentIssueDetector` | 1 congested client in each of 3 unrelated calls | `CROSS_CALL_ISSUE_ONSET_BURST` |
| 3 | `IssueFanOutDetector` | all subscribers of Alice's mic report concealment | `PUBLISHED_TRACK_ISSUE_FAN_OUT` |
| 4 | `TrackDeliveryMismatchDetector` | Alice sending, every subscriber dry | `PUBLISHED_TRACK_NOT_DELIVERED` |
| 5 | `SimulcastReceiverValidator` | outlier receiver present, publisher ignores it | reports `layer-decided-per-receiver` (a **validator** — one-shot, then dropped) |
| 6 | `UnconsumedTrackDetector` | Alice publishes, nobody subscribes | `UNCONSUMED_PUBLISHED_TRACK` |
| 7 | *(no ICE detector)* | ICE trouble is reported by client-monitor >= 4.6.0 as keyed issues; correlating it is config, not a class | — |
| 8 | `TurnServerHealthDetector` | 5/6 unhappy on one relay, 0/6 on another | `TURN_SERVER_DEGRADED` |
| 9 | `TurnServerOutageDetector` | one relay's population collapses, the other carries on | `TURN_SERVER_OUTAGE` |
| 10 | `ClientPopulationIssueDetector` | 5/6 on Chrome 141 struggling, 1/8 on Chrome 140 | `CLIENT_POPULATION_ISSUE` |
| 11 | `PublisherFaultCorroborationDetector` | Alice reports her own encoder bottleneck while her subscribers report freezes | `CORROBORATED_PUBLISHER_FAULT` |

Each scenario builds a fresh `Observer` — which starts with zero detectors, since none are ever
created implicitly — and adds only the one under test. That is *not* how to configure production —
there you register everything you want up front, which the final section shows — but it makes each
finding traceable to one detector. The script asserts every expected finding fired, and that the
validator settles, and exits non-zero otherwise, so it doubles as a smoke test.

Three things it makes concrete that are easy to get wrong:

- **The minimum sample shape each detector needs.** The `clientSample` builder shows exactly which
  fields matter — the `mediaSource` linking an outbound track to its RTPs, the `producerId` /
  `consumerId` attachments the resolver reads, and the fact that the TURN url belongs on the
  **local** ICE candidate (per W3C webrtc-stats, remote candidates never carry one).
- **ICE state is an event, not a stat.** It arrives as `ICE_CONNECTION_STATE_CHANGED` in
  `clientEvents`, because it is a transition rather than a sampled value.
- **`UnconsumedTrackDetector` measures wall-clock time, not sample time.** A synthetic replay cannot
  fast-forward its `minUnconsumedDurationInMs`, so the example sets it to `0` and says why.
