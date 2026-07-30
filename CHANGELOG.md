# Changelog

## 1.0.0

First stable release of `@observertc/observer-js` — a server-side Node.js library that turns a
stream of WebRTC `ClientSample`s into a live, queryable model of every call, with a single typed
event bus and pluggable extension points. This entry states the full set of features and concepts
the 1.0.0 API provides.

### Core model

- **Entity hierarchy.** `Observer → ObservedCall → ObservedClient → ObservedPeerConnection →`
  sub-stats (inbound/outbound RTP, remote inbound/outbound RTP, inbound/outbound tracks, codecs,
  data channels, ICE transports/candidates/candidate-pairs, certificates, media sources, media
  playouts, peer-connection transports). Every node holds current + cumulative metrics and is
  reachable by id through `Map`s on its parent.
- **One ingestion method.** `observer.accept(sample, context?)` is the only way data gets in.
  Calls, clients and peer connections are **created lazily** the first time their id appears.
- **Single event bus.** Everything worth subscribing to is emitted on the **`Observer`** itself,
  with a payload object that carries the full ancestry (observer → call → client → peer connection)
  down to the subject. `on`/`off`/`once`/`emit` are fully typed against the event map. Local
  EventEmitter lifecycle events remain on each component for internal teardown wiring.
- **Pull or react.** Read fields off the entities at any time, and/or subscribe to events.

### Ingestion & configuration

- **`accept(sample, context?)`** with a transient, free-form `AcceptContext` that is threaded down
  the accept chain and carried to the `*-updated` events of that pass — and **never** written to
  `appData`.
- **`appData` vs `context`.** `appData` is application-owned, fixed at entity creation (via
  `settings.appData` or the `createCallAppData` / `createClientAppData` factories) and never mutated
  by the library; `context` is per-accept and ephemeral.
- **Accept middlewares.** `observer.acceptMiddlewares` — a global, pre-dispatch chain run on every
  sample before it reaches any call/client (inspect, mutate/normalize ids, enrich).
- **Event-driven update policies.** Observer and call aggregation triggers are
  `update-on-any-…-updated` / `update-when-all-…-updated` / `none`. There are **no internal timers**;
  with `none` (or to drive a fixed cadence) the app calls the public `observer.update()` /
  `call.update()` itself.
- **Automatic teardown.** Optional `closeClientIfIdleForMs` and `closeCallIfEmptyForMs`; closing
  cascades down the tree and emits the matching `*-closed` / `*-removed` events.

### Derived metrics

- **Counter-reset-safe deltas.** Per-tick deltas never go negative across counter resets / SSRC
  reuse (guarded `curr >= prev`).
- **Per-stream metrics**: bitrates, packet/byte deltas, jitter, fraction-lost, RTT, etc.
- **Remote-RTP correlation.** Receiver/sender RTCP reports are linked to the local stream by
  `remoteId`/SSRC and surfaced as `remote*` fields (e.g. `remoteRttInMs`, `remoteFractionLost` on
  outbound; `remoteRttInMs`, `remoteBytesSent` on inbound).
- **TURN/TCP usage** derived from the selected ICE candidate pair (`usingTURN` / `usingTCP`), with a
  call-level `ObservedTURN` view.

### Optional track correlation

- **`RemoteTrackResolver`** — a generic, strategy-driven resolver that links a published (outbound)
  track to the subscribed (inbound) tracks carrying it (**one publisher → many subscribers**) by a
  **publisher id** (the link key). Links are maintained directly on the tracks
  (`inboundTrack.remoteOutboundTrack`, `outboundTrack.remoteInboundTracks`).
- **Opt-in via `ObserverConfig.createRemoteTrackResolver`**, invoked per call. Built-in factories:
  `createDefaultMediasoupRemoteTrackResolverFactory()` (producerId/consumerId attachments) and
  `createP2pRemoteTrackResolverFactory()` (RTP SSRC). Custom topologies supply their own
  publisher/subscriber id resolvers.

### Per-client sample sinks

- **`ClientSampleSink`** — an object-mode, `EventEmitter`-based base class (`write(sample)`,
  `end()`, typed `close`/`error`/`finish`/`drain` events). One sink per `ObservedClient`, produced
  by `ObserverConfig.createClientSink`; the `client-sink-created` event delivers it on the bus.
- **Built-ins:** `JsonlFileSink` (+ `createJsonlFileSink` / `createJsonlFileSinkFactory`, exposing
  `path` and a custom `serializeSample`) and the env-agnostic `InMemorySink`.

### Detectors & call-level issues

- **`Detectors`** — a server-side extension-point registry on `ObservedCall` (ships empty; runs each
  registered detector on `call.update()`, isolating throws). `call.addIssue(...)` raises a
  call-level issue surfaced on the bus as `call-issue`; client-reported issues surface as
  `client-issue`.

### Logging

- **Pluggable logger** — a single swappable sink (`setObserverLogger`, `createLogger`) with a
  documented funnel for pino/winston/console (`docs/logging.md`).

### Error-handling philosophy

- **Warn, don't throw** on operational/edge conditions. `create*` / `getOrCreate*` return
  `T | undefined` (closed parent → `undefined` + warn; duplicate id → existing instance + warn).
  Missing `callId`/`clientId` or a closed observer → a `sample-rejected` event.

### Packaging & tooling

- **Server-side, Node.js ≥ 22.** Shipped as a **dual ESM + CommonJS** build (single entry) via
  `tsup`, with `.d.ts`/`.d.mts` types and sourcemaps; works with both `import` and `require()`.
- **CI gate** (lint + typecheck + build + tested with a **coverage threshold**) and **npm Trusted
  Publishing (OIDC) with provenance**.

### Documentation

- A self-sufficient `README.md`; `docs/logging.md`; and design docs for the roadmap, track
  correlation & detectors, the call-level-detector analysis, and the (deferred) report-generation
  approach.
