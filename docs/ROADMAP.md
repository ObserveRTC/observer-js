# Roadmap & backlog (consolidated)

This file consolidates the information that previously lived in three planning docs which have
since been removed from the repo:

- `ANALYSIS.md` — the original codebase analysis (usability, good practices, maintainability) plus
  the study of how the SFU (`livecalls-sfu` `ObserverWorker`) and `livecalls-stats` use the
  library, and the resulting feature recommendations.
- `IMPLEMENTATION_PLAN.md` — the phased plan derived from that analysis.
- `docs/sample-processing-and-sinks.md` — the design for a `ClientSampleProcessor` ingestion
  pipeline and the sample-sink subproject.

It is a **working backlog**, not a spec: the point is to have every idea in one place so we can
sort them and decide what actually gets built. The exact original text of the removed docs is
still in git history if a verbatim copy is ever needed:

```bash
git log --oneline -- ANALYSIS.md IMPLEMENTATION_PLAN.md docs/sample-processing-and-sinks.md
git show <commit>:ANALYSIS.md
```

---

## 1. Already done (for reference)

These came out of the analysis/plan and are now implemented, so they are **not** backlog items:

- **Bug fixes:** outbound-RTP packet/byte counter mix-ups; `return` → `continue` in the
  `iceTransports` loop in `ObservedPeerConnection`.
- **Tooling:** repaired the lint setup; ESM-only build via `tsup`; CI gate (lint + typecheck +
  build + test); npm Trusted Publishing (OIDC) + provenance.
- **Warn-don't-throw** across operational/edge conditions; `create*`/`getOrCreate*` return
  `T | undefined`.
- **Discriminated-union config** (`update-on-interval` requires an interval at compile time).
- **`sample-rejected`** event; **`accept(sample, context?)`** with transient per-accept context
  carried only to `*-updated` events (never written to `appData`).
- **Counter-reset-safe deltas** (analysis item **A1**).
- **Remote-RTP correlation** (analysis item **A3**) — receiver/sender reports linked by
  `remoteId`/SSRC and surfaced as `remote*` fields.
- **Single event bus**: every subscribe-worthy event emitted on the `Observer` with an
  ancestry-carrying payload; local lifecycle events kept on components for teardown; per-component
  `eventScope` + `_notify`.
- **`appData` factories** (`createCallAppData` / `createClientAppData`).
- **Detectors** reduced to a generic `Detectors` registry on `ObservedCall` only (server-side
  extension point) with `call.addIssue()` → `call-issue`.
- **Per-client sinks**: `ClientSampleSink` base class, `JsonlFileSink` / `InMemorySink`,
  `createClientSink` factory, `client-sink-created` event, object-mode `write(sample)`.
- **Logger** exported + documented (`docs/logging.md`).

---

## 2. Open backlog (candidates to sort & decide)

### 2.1 `ClientSampleProcessor` — middleware ingestion pipeline

**Status: designed, not built.** A thin pipeline that sits *in front of* `observer.accept()`,
built on the existing `common/Middleware.MiddlewareProcessor<T>`. The same class serves **live**
ingestion (SFU calls `process()` per incoming sample) and **offline replay** (feed recorded
samples in timestamp order); because both paths end in `observer.accept()`, offline == live by
construction.

Envelope flowed through the pipeline (so middlewares get a side channel beyond the bare sample):

```ts
export type ClientSampleProcessingContext = {
  sample: ClientSample;
  acceptContext?: AcceptContext;          // forwarded to observer.accept(sample, acceptContext)
  attachments?: Record<string, unknown>;  // free scratch for middlewares
};
```

Class sketch:

```ts
import { Middleware, MiddlewareProcessor } from '../common/Middleware';

export class ClientSampleProcessor {
  private readonly _pipeline = new MiddlewareProcessor<ClientSampleProcessingContext>();

  constructor(private readonly observer: Observer) {
    // terminal: hand the (possibly transformed) sample to the observer
    this._pipeline.finalCallback = ({ sample, acceptContext }) =>
      this.observer.accept(sample, acceptContext);
  }

  use(...mw: Middleware<ClientSampleProcessingContext>[]): this {
    this._pipeline.addMiddleware(...mw);
    return this;
  }

  remove(...mw: Middleware<ClientSampleProcessingContext>[]): this {
    this._pipeline.removeMiddleware(...mw);
    return this;
  }

  /** Run one sample through the pipeline → observer.accept. */
  process(sample: ClientSample, acceptContext?: AcceptContext): void {
    this._pipeline.process({ sample, acceptContext });
  }
}
```

Notes:
- `MiddlewareProcessor.process()` already spins a fresh executor per call, so it's reusable.
- **Dropping a sample** = a middleware simply not calling `next()` (validation can short-circuit).
- **Mutating** = a middleware edits `ctx.sample` / `ctx.acceptContext` then calls `next(ctx)`.

Built-in middleware factories (all optional, composable):

| Factory | Purpose |
|---------|---------|
| `validate(opts?)` | drop or repair samples missing `callId`/`clientId` (pre-empts `sample-rejected`) |
| `enrich(fn)` | set `callId`/`clientId`, populate `acceptContext`, tag attachments |
| `normalizeTimestamps()` | monotonic-timestamp / clock-skew correction (item **A2**), stateful per `clientId` |
| `tap(fn)` | side-effect / inspection without altering the sample |
| `sink(sampleSink)` | persist the sample (superseded by the per-client sink factory, but still possible) |

Decoding (protobuf/base64 → `ClientSample`) stays the app's concern and runs *before* the
processor. Offline replay: feed recorded samples sorted by timestamp; for determinism use a
timer-free update policy (`update-on-any-client-updated`), not `update-on-interval`.

Location & exports: new `src/processors/ClientSampleProcessor.ts` (+ `src/processors/middlewares.ts`),
export `ClientSampleProcessor`, `ClientSampleProcessingContext`, and the factories from `index.ts`
(`Middleware` is already exported).

### 2.2 Monotonic-timestamp / clock-skew handling (analysis item A2)

Client wall-clock timestamps can jump (NTP corrections, suspend/resume, bad clocks). A
`normalizeTimestamps()` step (stateful per `clientId`) would enforce monotonic timestamps and
correct skew before metrics are derived. Fits naturally as a `ClientSampleProcessor` middleware,
but could also be a standalone helper. Needed for trustworthy rate/delta math and for replay.

### 2.3 Real server-side detectors (cross-client)

The `Detectors` registry exists on `ObservedCall` but ships empty by design — per-client signals
(packet loss, jitter, RTT, freezes) are already detected on the client and arrive as
`clientIssues`. Server-side detection should focus on what only the server can see by correlating
across the clients of a call. Candidate detectors to design:

- **Producer→consumer delivery mismatch** (SFU): a producer is healthy but its consumers aren't
  receiving — points at server-side forwarding/SFU issues.
- **Quality outlier**: one participant materially worse than the rest of the call.
- **Asymmetric media**: send/receive imbalance that the client can't see alone.

Each would implement `Detector`, be registered on `call-added`, and surface findings via
`observedCall.addIssue(...)` → `call-issue`.

### 2.4 Expanded derived metrics

Beyond the current set: jitter-buffer delay, concealment events/samples, freeze count & fraction,
encode/decode CPU/time, quality-limitation reason breakdown, and first-class
producer/consumer & peer-connection-direction fields (instead of relying on `attachments`).

### 2.5 Per-tick snapshot API

A serializable, immutable snapshot emitted per `*-updated` tick, so consumers can subscribe to one
coarse event instead of the fine-grained `*-updated` sub-stat firehose. Pairs well with the
"read fields on `client-updated` / `call-updated`" guidance. (Possible name: `SnapshotCollector`.)

### 2.6 Batch `processSamples()` / offline replay helper

A first-class entry point for offline analysis of recorded sample streams (sort by timestamp,
feed through the same accept path, collect results via bus subscriptions). Largely subsumed by the
`ClientSampleProcessor` offline-replay path, plus a small result-collector helper.

### 2.7 Protobuf sink (optional)

A sink that serializes via the encoder side of `@observertc/samples-decoder` for compact storage,
selected by the sink implementation (the `ClientSampleSink` interface is format-agnostic — `write`
takes the object, the sink decides serialization).

### 2.8 Tests

Only a placeholder spec exists. Priority targets for characterization tests: the two `accept()`
methods (`ObservedClient`, `ObservedPeerConnection`), the delta/counter-reset math, and remote-RTP
correlation. The CI gate is already wired to run them.

### 2.9 SFU `ObserverWorker` migration

Port `livecalls-sfu/src/stats/ObserverWorker.ts` to the current API: subscribe on the single
Observer event bus, use `createClientSink` / `createJsonlFileSinkFactory` instead of hand-rolled
JSONL writing, and guard the `| undefined` returns of `create*`/`getOrCreate*`.

---

## 3. Open design decisions

Carried over from the sample-processing design — decide before/while building §2.1:

- **D-A:** Is `write()` strictly synchronous/non-blocking (sink buffers internally) — assumed yes
  — or do we allow an awaited async write (would push `accept`/the pipeline async)?
- **D-B:** Ship sinks in this package vs. in the consuming app. Current answer: in-package.
- **D-C:** Default position of a `sink()` middleware in the pipeline — assumed post-normalization,
  pre-accept (so persisted samples are already cleaned and replay needs no re-normalization).
- **D-D:** Should `ClientSampleProcessor` own a raw-input decode front-end, or keep decoding
  entirely outside? Assumed: decoding stays outside.

---

## 4. Sink-specific metadata (how to expose info like a file path)

Concrete sinks expose their own **public readonly** fields; consumers narrow the base-typed
`sink` with `instanceof` to read them. `JsonlFileSink` now exposes `path`:

```ts
import { JsonlFileSink } from '@observertc/observer-js';

observer.on('client-sink-created', ({ observedClient, sink }) => {
  if (sink instanceof JsonlFileSink) {
    const { path } = sink;                       // sink-specific info
    sink.once('close', () => uploadFile(path));  // file is flushed & fd closed = ready
  }
});
```

A custom sink (e.g. an HTTP/queue sink) exposes whatever it needs the same way (its endpoint, a
batch id, etc.). If we accumulate many sink types and want to avoid importing each class, a small
`readonly kind` discriminant on the base + a `switch (sink.kind)` is the natural next step —
**open question**, not yet added.
