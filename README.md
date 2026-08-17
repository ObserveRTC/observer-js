# ObserverTC — `@observertc/observer-js`

[![NPM version](https://img.shields.io/npm/v/@observertc/observer-js.svg)](https://www.npmjs.com/package/@observertc/observer-js)
[![License](https://img.shields.io/npm/l/@observertc/observer-js.svg)](https://github.com/observertc/observer-js/blob/main/LICENSE)

> **In one line:** feed it WebRTC `getStats()` snapshots, and get back a live, queryable model of
> every call plus a single typed event stream to react to.

`observer-js` is a **server-side Node.js library for monitoring WebRTC sessions**. A WebRTC
application (typically an SFU or a signaling/stats backend) feeds it `ClientSample` objects —
periodic snapshots of each participant's `RTCPeerConnection.getStats()` output plus
application events — and `observer-js` maintains a live, in-memory model of every call,
participant, peer connection, and media stream, derives per-interval and cumulative metrics,
and emits a single, unified stream of typed events the application can react to.

**What you can do with it:**

- **Monitor calls live** — a queryable in-memory tree of every call, client, peer connection,
  track, codec, ICE candidate and data channel, each holding current **and** cumulative metrics.
- **React on one event bus** — subscribe once on the `Observer`; every payload carries its full
  ancestry (`call → client → peer connection → stat`), so you never walk the tree to subscribe.
- **Get derived metrics for free** — counter-reset-safe per-tick deltas, bitrates, jitter, RTT,
  fraction-lost, remote-RTP (RTCP) correlation, and TURN/TCP usage from the selected candidate pair.
- **Correlate across an SFU** — link a publisher's outbound track to every subscriber's inbound
  track (`RemoteTrackResolver`), and observe mediasoup routers/transports/producers/consumers
  on the server side.
- **Detect server-only problems** — cross-client `Detector`s raise `call-issue`s for conditions no
  single client can see (e.g. everyone in a call degrading at once).
- **Persist every sample** — per-client sinks (JSONL file, in-memory, or your own) for archival,
  streaming, and offline replay.
- **Drop it in safely** — warn-don't-throw, a pluggable logger, dual **ESM + CommonJS**, and **no**
  media-stack dependency in the core.

> **Status:** `1.0.0-beta`. The API described here is current and intended to be implemented
> against directly. This document is written to be self-sufficient: an engineer (or an AI
> agent) should be able to integrate the library, or develop it further, from this file alone.
> A companion doc, [`docs/logging.md`](./docs/logging.md), covers logging integration in depth.

> **Packaging:** server-side, **Node.js ≥ 22**, shipped as a **dual ESM + CommonJS** build — so it
> works whether your project uses `import` (ESM) or `require()` (CommonJS). Everything — including
> the built-in file sink — is exported from the single `@observertc/observer-js` entry.

> **For AI agents:** [`llms.txt`](./llms.txt) is a curated map of these docs (it belongs at the root
> of the docs site); [`AGENTS.md`](./AGENTS.md) covers build/test commands and the conventions for
> working **in** this repository.

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Data flow](#data-flow)
4. [Entity hierarchy](#entity-hierarchy)
5. [Ingestion: `accept()`, context & lifecycle](#ingestion-accept-context--lifecycle)
6. [When things update](#when-things-update)
7. [The event bus](#the-event-bus) ← the core of the API
8. [API reference](#api-reference)
9. [Schema types (`ClientSample`)](#schema-types-clientsample)
10. [Detectors (server-side extension point)](#detectors-server-side-extension-point)
11. [Call summaries](#call-summaries)
12. [Remote track resolution (mediasoup / SFU)](#remote-track-resolution-mediasoup--sfu)
13. [Mediasoup router observation](#mediasoup-router-observation)
14. [Sinks (per-client sample persistence)](#sinks-per-client-sample-persistence)
15. [Injecting data into a client](#injecting-data-into-a-client)
16. [Logging](#logging)
17. [Design notes](#design-notes)
18. [Error-handling philosophy](#error-handling-philosophy)
19. [Development & extension guide](#development--extension-guide)

---

## Installation

```bash
npm install @observertc/observer-js
# or
yarn add @observertc/observer-js
```

**Server-side, Node.js ≥ 22, dual ESM + CommonJS.** The package ships both module formats, so it
works the same whether your project is ESM or CommonJS — your import line is unchanged either way:

```ts
import { Observer, ClientSample, createJsonlFileSinkFactory } from '@observertc/observer-js';
```

In an ESM project this resolves to the `.mjs` build; in a CommonJS project (where TypeScript
compiles your `import` down to `require()`) it resolves to the `.js` build. Everything is exported
from the single `@observertc/observer-js` entry. Written in TypeScript; ships type declarations for
both formats (`dist/index.d.ts` for `require`, `dist/index.d.mts` for `import`). Runtime
dependencies: `@bufbuild/protobuf`, `events`, `uuid`. The library does **not** bundle a logger or
any transport — see [Logging](#logging).

`ClientSample` and friends are re-exported from this package, and are also published as the
shared schema in [`@observertc/schemas`](https://github.com/observertc/schemas); samples
produced on the client (e.g. by `@observertc/client-monitor-js`) conform to the same shape.

---

## Quick start

```ts
import { Observer, ClientSample } from '@observertc/observer-js';

// 1. Create an observer.
const observer = new Observer({
  // a call updates when any of its clients does, and the observer when any of its calls does —
  // both default to true, so this line is only here to show the knob exists:
  autoUpdateOnCallUpdate: true,
  // optional auto-teardown:
  closeCallIfEmptyForMs: 20_000,
  closeClientIfIdleForMs: 60_000,
});

// 2. Subscribe on the single bus. Every payload is an object with the ancestry.
observer.on('call-added', ({ observedCall }) => {
  console.log('new call', observedCall.callId);
});

observer.on('client-issue', ({ observedClient, issue }) => {
  console.warn(`[${observedClient.clientId}] ${issue.type}`, issue.payload);
});

observer.on('peer-connection-updated', ({ observedClient, observedPeerConnection }) => {
  console.log(observedClient.clientId, 'RTT(ms):', observedPeerConnection.currentRttInMs);
});

observer.on('sample-rejected', ({ reason, sample }) => {
  console.warn('dropped a sample:', reason);
});

// 3. Feed samples. `context` (optional) is transient per-accept data, carried to the
//    `*-updated` events this accept triggers (never written to appData).
function onClientStats(sample: ClientSample) {
  observer.accept(sample, { studioVersion: '1.2.3' });
}

// 4. Tear down.
process.on('SIGINT', () => observer.close());
```

---

## Data flow

```
client getStats()  ──►  ClientSample  ──►  observer.accept(sample, ctx?)
                                               │
              ┌────────────────────────────────┘
              ▼
   get-or-create ObservedCall ──► get-or-create ObservedClient ──► client.accept(sample, ctx)
                                                                        │
                                              per peerConnections[] in the sample
                                                                        ▼
                                              get-or-create ObservedPeerConnection
                                              .accept(pcSample, ctx) updates all sub-stats,
                                              derives deltas/bitrates/RTT, correlates remote RTP
                                                                        │
                          metrics roll up: PeerConnection → Client → Call → Observer
                                                                        │
                                          events emitted on the Observer bus  ──►  your handlers
```

- A sample **must** have `callId` and `clientId` (the library sets them, or the app does). If
  either is missing, the sample is dropped and `sample-rejected` is emitted.
- Sub-entities that stop appearing in samples are garbage-collected via a "visited"
  mark-and-sweep on each `ObservedPeerConnection.accept()`, emitting the corresponding
  `*-removed` events.

---

## Entity hierarchy

| Class | Created by | Keyed on its parent as | Holds |
|-------|-----------|------------------------|-------|
| `Observer` | `new Observer(config?)` | — (root) | `observedCalls: Map<string, ObservedCall>`, global counters, the event bus |
| `ObservedCall` | `observer.createObservedCall(settings)` / lazily by `accept` | `observedCalls` | `observedClients: Map<string, ObservedClient>`, call-wide metrics, `detectors`, `scoreCalculator` |
| `ObservedClient` | `call.createObservedClient(settings)` / lazily | `observedClients` | `observedPeerConnections: Map<string, ObservedPeerConnection>`, per-client metrics |
| `ObservedPeerConnection` | lazily, from `sample.peerConnections[]` | `observedPeerConnections` | the 15 sub-stat maps below, transport/RTT/bitrate metrics |
| Sub-stats | lazily, from the `PeerConnectionSample` | maps on the PC | individual WebRTC stat objects |

`ObservedPeerConnection` sub-stat maps (all `public readonly`):

```
observedCertificates, observedCodecs, observedDataChannels,
observedIceCandidates, observedIceCandidatesPair, observedIceTransports,
observedInboundRtps, observedInboundTracks, observedMediaPlayouts,
observedMediaSources, observedOutboundRtps, observedOutboundTracks,
observedPeerConnectionTransports, observedRemoteInboundRtps, observedRemoteOutboundRtps
```

Each sub-stat class (`ObservedInboundRtp`, `ObservedOutboundRtp`, `ObservedInboundTrack`,
`ObservedOutboundTrack`, `ObservedDataChannel`, `ObservedIceCandidate`,
`ObservedIceCandidatePair`, `ObservedIceTransport`, `ObservedCertificate`, `ObservedCodec`,
`ObservedMediaSource`, `ObservedMediaPlayout`, `ObservedPeerConnectionTransport`,
`ObservedRemoteInboundRtp`, `ObservedRemoteOutboundRtp`) mirrors the corresponding stat
fields from the schema plus derived fields (deltas, bitrates).

---

## Ingestion: `accept()`, context & lifecycle

### `observer.accept(sample, context?)`

The single entry point. It:

1. drops + emits `sample-rejected` if the observer is closed;
2. runs the sample through the **global accept-middleware chain** (see below);
3. (chain terminal) drops + emits `sample-rejected` if `callId`/`clientId` is missing;
4. gets or lazily creates the `ObservedCall` and `ObservedClient` (their `appData` comes from the
   configured factories, never from `context`);
5. delegates to `client.accept(sample, context)`, which fans out to each
   `ObservedPeerConnection.accept(pcSample, context)`.

### Accept middlewares (global pre-dispatch hook)

`observer.addAcceptMiddleware(...)` registers middlewares run on **every** sample inside
`accept()`, in order, **before** the sample is dispatched to any call or client. Each middleware
gets a `{ sample, context }` payload; it can inspect or mutate the sample (set/normalize
`callId`/`clientId`, enrich, redact) or the context, then call `next(payload)` to continue.
**Not calling `next` drops the sample** — nothing is created and no event fires. A throwing
middleware is caught and warns (the sample is dropped), never crashing `accept()`.

```ts
import { Observer, AcceptMiddleware } from '@observertc/observer-js';

const observer = new Observer();

// derive callId/clientId from the app's own attachment, before dispatch
const route: AcceptMiddleware = ({ sample }, next) => {
  sample.callId ??= sample.attachments?.roomId as string;
  sample.clientId ??= sample.attachments?.peerId as string;
  next({ sample });
};

// drop samples from a blocklisted client (never dispatched)
const filter: AcceptMiddleware = (payload, next) => {
  if (blocked.has(payload.sample.clientId)) return;   // no next() => dropped
  next(payload);
};

observer.addAcceptMiddleware(route, filter);
// observer.removeAcceptMiddleware(route);
```

This is a lightweight global injection point. When no middleware is registered, `accept()`
dispatches directly with no overhead.

### `context` (the `AcceptContext`)

```ts
type AcceptContext = Record<string, unknown>;
```

A single, optional, free-form object threaded down the whole accept chain
(`Observer → Client → PeerConnection`). It is **transient request-scoped data** — temporary or
contextual information the application wants available while an update is processed.

`context` is **never written to `appData`** and is **not stored** on any entity. The two are
deliberately distinct:

- **`appData`** — application-assigned extra info that identifies/decorates an entity, fixed at
  creation (via `settings.appData` or the `createCallAppData` / `createClientAppData` factories),
  or assigned by the app on the `*-added` events. The library never changes it. The factories
  **receive the context of the `accept()` that triggered the creation**, so a fact carried on the
  context can be baked into `appData` at birth — but it is copied by the factory, deliberately, not
  written across by the library.
- **`context`** — passed per `accept()`, may differ on every call, and is carried straight
  through to the `*-updated` events that the `accept()` triggers, then discarded.

`client-updated` and `peer-connection-updated` carry the exact context of that sample;
`call-updated` carries the context of the client `accept()` that drove the call update (absent
for interval- or teardown-driven call updates). When no context is given, the field is absent.

### Get-or-create helpers

If you want to create/configure entities yourself before/without samples:

```ts
const call = observer.getOrCreateObservedCall({ callId, appData });        // ObservedCall | undefined
const client = call?.getOrCreateObservedClient({ clientId, appData });     // ObservedClient | undefined
```

These return `undefined` (and warn) when the parent is closed; `createObservedCall`/
`createObservedClient` return the **existing** instance (and warn) if the id already exists.

### Automatic teardown

- `closeClientIfIdleForMs` — a client with no sample for this long auto-closes.
- `closeCallIfEmptyForMs` — a call with zero clients for this long auto-closes.
- Closing cascades down (call → clients → peer connections → sub-stats), unsubscribing
  listeners and emitting the `*-closed` / `*-removed` events.

---

## When things update

"Update" means *recompute aggregated metrics, run the detectors, and emit the `*-updated` event* at
that level. Updates are **event-driven** — there is no built-in timer.

The rule is structural rather than configurable:

> **A call is updated when any of its clients is updated. The observer is updated when any of its
> calls is updated.** Composed, that means the observer is updated exactly when any client anywhere
> is updated.

Two booleans, both defaulting to `true`, let you opt out of a link in that chain:

| Setting | Where | Effect when `false` |
|---------|-------|---------------------|
| `autoUpdateOnClientUpdate` | `ObservedCallSettings` | the call updates only when you call `call.update()` |
| `autoUpdateOnCallUpdate` | `ObserverConfig` | the observer updates only when you call `observer.update()` |

An app that wants a fixed cadence sets both to `false` and drives `observer.update()` from its own
`setInterval`. Note that **observer-scoped detectors and validators run nowhere else** — if the
observer never updates, they never run.

```ts
const observer = new Observer({ autoUpdateOnCallUpdate: false });

setInterval(() => observer.update(), 5_000);
```

> Earlier versions had an `updatePolicy` / `defaultCallUpdatePolicy` enum (`'update-on-any-…'`,
> `'update-when-all-…'`, `'none'`) and a pluggable `Updater` object. Both are gone. "When all clients
> have updated" sounds appealing and deadlocks on the first client that stops sending — one silent
> participant froze the whole call's aggregation until it timed out.

---

## The event bus

This is the primary API. **Subscribe on the `Observer` instance** — it is the single emitter
for the entire hierarchy. The `ObservedCall` / `ObservedClient` / `ObservedPeerConnection`
objects are themselves `EventEmitter`s too, but those local events are reserved for internal
lifecycle/teardown wiring (see [Local lifecycle events](#local-lifecycle-events)); application
code should use the Observer bus.

### Payload shape: ancestry + subject

Every Observer event delivers exactly **one argument: a payload object**. The payload always
contains the ancestry from the observer down to the entity that raised it, plus any event-
specific subject:

```ts
type ObserverEventBase            = { observer: Observer, context?: AcceptContext };
type ObservedCallScope            = ObserverEventBase            & { observedCall: ObservedCall };
type ObservedClientScope          = ObservedCallScope            & { observedClient: ObservedClient };
type ObservedPeerConnectionScope  = ObservedClientScope          & { observedPeerConnection: ObservedPeerConnection };
```

So a peer-connection-level event hands you the observer, call, client, **and** peer connection:

```ts
observer.on('inbound-rtp-added', ({ observer, observedCall, observedClient, observedPeerConnection, observedInboundRtp }) => {
  // all five are present and correctly typed
});
```

`observer.on/off/once/emit` are fully typed against the event map — the handler argument is
inferred per event name.

### Event catalogue

All payloads include the ancestry for their level (above). The **Extra** column lists the
additional field(s) on top of that scope.

#### Observer level — scope `{ observer }`

| Event | Extra payload | Fires when |
|-------|---------------|-----------|
| `observer-updated` | — | `observer.update()` ran (see [When things update](#when-things-update)) |
| `observer-closed` | — | `observer.close()` |
| `sample-rejected` | `{ reason: 'observer-closed' \| 'missing-callId' \| 'missing-clientId', sample: ClientSample }` | a sample was dropped by `accept()` |
| `observer-issue` | `{ issue: ObserverIssue }` | `observer.addIssue(...)` — a cross-call / SFU-wide finding (see [observer-level detectors](#observer-level-detectors-cross-call--sfu-wide)) |
| `validation-ready` | `{ validator: string, report: ValidationReport }` | a [validator](#validators--one-shot-structural-checks) settled — fires once per check, not per tick |

#### Mediasoup level — scope `{ observer, observedMediasoupRouter }`

| Event | Extra | Fires when |
|-------|-------|-----------|
| `mediasoup-router-added` | — | `observer.createObservedMediasoupRouter(...)` registered a router |
| `mediasoup-router-matched-with-peer-connection` | `{ observedCall, observedClient, observedPeerConnection }` | a newly added peer connection's id matched one of the router's WebRTC transport ids. **Opt-in** via `matchPeerConnectionByWebRtcTransportId: true`. |
| `mediasoup-router-removed` | — | the underlying mediasoup router closed (its `router.observer` `close` fired) |

See [Mediasoup router observation](#mediasoup-router-observation) for the full design and examples.

#### Call level — scope `{ observer, observedCall }`

| Event | Extra | Fires when |
|-------|-------|-----------|
| `call-added` | — | a call is created |
| `call-updated` | `{ context?: AcceptContext }` | `call.update()` ran |
| `call-closed` | — | the call closed |
| `call-empty` | — | last client left the call |
| `call-not-empty` | — | first client joined a previously-empty call |
| `call-issue` | `{ issue: CallIssue }` | `call.addIssue(...)` (server-side detector finding) |
| `call-summary` | `{ summary: CallSummary }` | the call is closing and a [summary](#call-summaries) was configured. Emitted **inside** `close()`, while the call is still reachable |

#### Client level — scope `{ observer, observedCall, observedClient }`

| Event | Extra | Fires when |
|-------|-------|-----------|
| `client-added` | — | a client is created |
| `client-sink-created` | `{ sink: ClientSampleSink }` | a per-client sink was created (only when `createClientSink` returns one); fires right after `client-added` |
| `client-updated` | `{ sample: ClientSample, elapsedTimeInMs: number, context?: AcceptContext }` | the client processed a sample |
| `client-closed` | — | the client closed |
| `client-joined` | — | first `CLIENT_JOINED` event seen |
| `client-left` | — | `CLIENT_LEFT` seen (or inferred on close) |
| `client-rejoined` | `{ timestamp: number }` | a later `CLIENT_JOINED` after an earlier join |
| `client-issue` | `{ issue: ClientIssue }` | a client-reported issue arrived, or `client.addIssue(...)`. A keyed issue also opens an entry in `observedClient.activeIssues` |
| `client-issue-resolved` | `{ resolvedIssue: ResolvedActiveClientIssue }` | a stateful issue ended — the client sent its `<type>-resolved` companion, or the observer force-closed it. Carries the finished interval (`durationInMs`, `resolvedBy`) — see [client issues](#client-issues-the-lifecycle-and-the-division-of-labour) |
| `client-metadata` | `{ metaData: ClientMetaData }` | a client meta item arrived |
| `client-extension-stats` | `{ extensionStats: ExtensionStat }` | an app-defined extension stat arrived |
| `client-event` | `{ event: ClientEvent }` | any client event was processed |

#### Peer-connection level — scope `{ observer, observedCall, observedClient, observedPeerConnection }`

| Event | Extra | Notes |
|-------|-------|-------|
| `peer-connection-added` / `peer-connection-closed` | — | lifecycle of the PC |
| `peer-connection-updated` | `{ context?: AcceptContext }` | the PC processed a sample |
| `ice-connection-state-changed` / `ice-gathering-state-changed` / `connection-state-changed` | `{ state: string }` | driven by client events |
| `inbound-track-added` / `-updated` / `-removed` / `-muted` / `-unmuted` | `{ observedInboundTrack }` | |
| `outbound-track-added` / `-updated` / `-removed` / `-muted` / `-unmuted` | `{ observedOutboundTrack }` | |
| `inbound-rtp-added` / `-updated` / `-removed` | `{ observedInboundRtp }` | `-updated` fires every tick |
| `outbound-rtp-added` / `-updated` / `-removed` | `{ observedOutboundRtp }` | `-updated` fires every tick |
| `remote-inbound-rtp-added` / `-updated` / `-removed` | `{ observedRemoteInboundRtp }` | |
| `remote-outbound-rtp-added` / `-updated` / `-removed` | `{ observedRemoteOutboundRtp }` | |
| `data-channel-added` / `-updated` / `-removed` | `{ observedDataChannel }` | |
| `ice-candidate-added` / `-updated` / `-removed` | `{ observedIceCandidate }` | |
| `ice-candidate-pair-added` / `-updated` / `-removed` | `{ observedIceCandidatePair }` | |
| `ice-transport-added` / `-updated` / `-removed` | `{ observedIceTransport }` | |
| `codec-added` / `-updated` / `-removed` | `{ observedCodec }` | |
| `media-source-added` / `-updated` / `-removed` | `{ observedMediaSource }` | |
| `media-playout-added` / `-updated` / `-removed` | `{ observedMediaPlayout }` | |
| `peer-connection-transport-added` / `-updated` / `-removed` | `{ observedPeerConnectionTransport }` | |
| `certificate-added` / `-updated` / `-removed` | `{ observedCertificate }` | |

> **Volume note.** The `*-updated` sub-stat events fire on every peer-connection `accept()`
> (i.e. per sample, per stream). For high-throughput servers, subscribe only to what you need,
> or read fields off the entities on `client-updated` / `call-updated` instead.

### Local lifecycle events

These remain on the individual entities (not the bus), for teardown/coordination. You can
listen to them, but prefer the bus equivalents above for application logic.

| Entity | Local events |
|--------|--------------|
| `ObservedCall` | `update`, `newclient`, `empty`, `not-empty`, `close` |
| `ObservedClient` | `update` (`sample`, `elapsedTimeInMs`), `close`, `joined`, `left` |
| `ObservedPeerConnection` | `removed-inbound-track`, `removed-outbound-track`, `close` |

---

## API reference

### `Observer`

```ts
new Observer<AppData>(config?: ObserverConfig<AppData>)

type ObserverConfig<AppData = Record<string, unknown>> = {
    // a call updates when any client does; the observer when any call does. Default true.
    autoUpdateOnCallUpdate?: boolean;
    appData?: AppData;
    closeClientIfIdleForMs?: number;
    closeCallIfEmptyForMs?: number;
    // accumulate a per-call summary (see Call summaries). Absent or null = off, and nothing
    // subscribes to anything. `{}` is valid: a summary with no built-in sections.
    callSummary?: Partial<CallSummaryConfig> | null;
    // appData factories — run when an entity is created without explicit appData
    // (incl. lazily by accept()). appData is application-owned; accept `context` never touches it.
    createCallAppData?: (p: { callId: string; observer: Observer; acceptCtx?: AcceptContext }) => Record<string, unknown>;
    createClientAppData?: (p: { clientId: string; observedCall: ObservedCall; acceptCtx?: AcceptContext }) => Record<string, unknown>;
    // sink factory — produces a per-client sink that receives every accepted sample (see Sinks).
    createClientSink?: (p: { clientId: string; observedCall: ObservedCall }) => ClientSampleSink | undefined;
    // remote-track-resolver factory — produces a call's RemoteTrackResolver (see Remote track resolution).
    createRemoteTrackResolver?: (observedCall: ObservedCall) => RemoteTrackResolver | undefined;
  };
```

**appData factories.** Instead of pre-creating a call/client (or assigning on `call-added` /
`client-added`) just to enrich its `appData`, register a factory once. It runs whenever the entity
is created without an explicit `settings.appData` — including the lazy creation inside `accept()`.
The `client` factory receives the already-created parent `observedCall`, so it can derive fields
from it.

Both also receive **`acceptCtx`**: the [`AcceptContext`](#context-the-acceptcontext) of the
`accept()` that caused the creation, or `undefined` when you created the entity yourself. This is
what lets an [accept middleware](#accept-middlewares-global-pre-dispatch-hook) resolve something
once — a tenant, a trace id — and have it land in `appData` at birth, instead of every factory
re-deriving it from the sample.

```ts
const observer = new Observer({
  createCallAppData:   ({ callId, acceptCtx })      => ({ callId, startedAt: Date.now(), tenant: acceptCtx?.tenant }),
  createClientAppData: ({ clientId, observedCall }) => ({ clientId, tenant: observedCall.appData.tenant }),
});

observer.accept(sample, { tenant: 'acme' });
```

`appData` stays application-owned: the context is *offered* to the factory, never written across by
the library, and it is still not stored on any entity.

Key members:

- `accept(sample: ClientSample, context?: AcceptContext): void`
- `addAcceptMiddleware(...mw: AcceptMiddleware[]): this` / `removeAcceptMiddleware(...mw): this` — global pre-dispatch sample hooks (see [Accept middlewares](#accept-middlewares-global-pre-dispatch-hook))
- `getObservedCall<T>(callId): ObservedCall<T> | undefined`
- `createObservedCall<T>(settings, acceptCtx?): ObservedCall<T> | undefined`
- `getOrCreateObservedCall<T>(settings, acceptCtx?): ObservedCall<T> | undefined`
- `addIssue(issue: Omit<ObserverIssue, 'scope'>): void` — raise an **observer-level** finding → emits `observer-issue`. `scope` is stamped for you
- `update(): void` — force an aggregation/`observer-updated` tick
- `addObserverDetector(name, config?): this` — build a cross-call detector onto `observer.detectors`
- `addCallDetector(name, config?): this` — register a call-scoped detector for every call created
  from now on
- `removeCallDetector(name, { includeOpenCalls? }): number` — stop building it, and (by default) drop
  it from calls already open. Returns how many live instances were removed
- `removeObserverDetector(name): number` — remove an observer-scoped detector. For one specific
  instance use `observer.detectors.remove(detector)`
- `addValidator(name, config?): this` — start a one-shot structural check
- `cancelValidator(name | validator, reason?): number` — stop a running check; it finishes
  `inconclusive` with the reason and emits `validation-ready`
- `close(): void`
- `readonly detectors: Detectors` — observer-scoped registry. **Starts empty**; nothing is implicit
- `readonly callDetectorConfigs: Map<name, config>` — what `addCallDetector` recorded
- `readonly callSummaryCollector?: CallSummaryCollector` — owns the resolved `config.callSummary`,
  the summary subscriptions, and the summaries. `undefined` when summaries are off, which is the
  only place that answer lives
- `readonly validators: Set<RunningValidator>` — normally empty; each removes itself on finishing
- `readonly activeIssuesRegistry: ActiveIssuesRegistry` — the fleet's open client issues
- `readonly observedCalls: Map<string, ObservedCall>`
- `readonly observedTURN: ObservedTURN`
- `get appData()`, `get numberOfCalls()`
- counters: `numberOfClients`, `numberOfClientsUsingTurn`, `numberOfInboundRtpStreams`,
  `numberOfOutboundRtpStreams`, `numberOfDataChannels`, `numberOfPeerConnections`,
  `totalAddedCall`, `totalRemovedCall`, `closed`
- `on/off/once/emit` typed against the [event map](#event-catalogue)

### `ObservedCall`

```ts
type ObservedCallSettings<AppData = Record<string, unknown>> = {
    // update this call whenever one of its clients accepts a sample. Default true.
    autoUpdateOnClientUpdate?: boolean;
    callId: string;
    appData?: AppData;
    closeCallIfEmptyForMs?: number;
  };
```

Key members:

- `readonly callId: string`, `appData: AppData`
- `readonly observedClients: Map<string, ObservedClient>`, `get numberOfClients()`
- `getObservedClient<T>(clientId)`, `createObservedClient<T>(settings, acceptCtx?)`, `getOrCreateObservedClient<T>(settings, acceptCtx?)` (all `… | undefined`)
- `addIssue(issue: Omit<CallIssue, 'scope'>): void` — raise a **call-level** finding → emits `call-issue`. `scope` is stamped for you
- `addDetector(name, config?): this` — build a call-scoped detector onto this call only
- `removeDetector(name): number` — remove it from this call, `close()`ing it. For one specific
  instance use `call.detectors.remove(detector)`
- `readonly detectors: Detectors` — server-side detector registry (empty by default; see [Detectors](#detectors-server-side-extension-point))
- `readonly activeIssuesRegistry: ActiveIssuesRegistry` — this call's open client issues, propagating into the observer's
- `readonly unconsumedOutboundTracks: Set<ObservedOutboundTrack>` — maintained by the resolver
- `scoreCalculator: ScoreCalculator`, `get score()`, `readonly calculatedScore`
- `remoteTrackResolver?: RemoteTrackResolver` — set from `ObserverConfig.createRemoteTrackResolver` at call creation (see [Remote track resolution](#remote-track-resolution-mediasoup--sfu))
- aggregates: `numberOfIssues`, `numberOfPeerConnections`, `numberOfInboundRtpStreams`,
  `numberOfOutboundRtpStreams`, `numberOfDataChannels`, `maxNumberOfClients`,
  `clientsUsedTurn: Set<string>`, `startedAt?`, `endedAt?`, `closedAt?`, `closed`
- `summary?: CallSummary` — the live record of this call, when [summaries](#call-summaries) are on
- `update()`, `close()`

### `ObservedClient`

```ts
type ObservedClientSettings<AppData = Record<string, unknown>> = {
  clientId: string;
  appData?: AppData;
  closeClientIfIdleForMs?: number;
};
```

Key members:

- `readonly clientId: string`, `appData: AppData`, `readonly call: ObservedCall`
- `readonly observedPeerConnections: Map<string, ObservedPeerConnection>`
- `readonly sink?: ClientSampleSink` — the per-client sink (see [Sinks](#sinks-per-client-sample-persistence)), if `createClientSink` is configured; listen on it for `close`/`error`
- **Injection API** (queue app data to be merged into the next sample processing):
  `injectEvent(ClientEvent)`, `injectIssue(ClientIssue)`, `injectMetaData(ClientMetaData)`,
  `injectExtensionStat(ExtensionStat)`, `injectAttachment(attachments: Record<string, unknown>)`
- **Direct add API** (process immediately): `addIssue(ClientIssue)`, `addMetadata(ClientMetaData)`,
  `addExtensionStats(ExtensionStat)`
- Metrics (current/derived): `currentAvgRttInMs?`, `currentMinRttInMs?`, `currentMaxRttInMs?`,
  `receivingAudioBitrate`, `receivingVideoBitrate`, `sendingAudioBitrate`, `sendingVideoBitrate`,
  `usingTURN`, `usingTCP`, `availableIncomingBitrate`, `availableOutgoingBitrate`
- Counts: `numberOfInboundRtpStreams`, `numberOfOutboundRtpStreams`, `numberOfInbundTracks`,
  `numberOfOutboundTracks`, `numberOfDataChannels`, `numberOfPeerConnections`
- Per-tick deltas: `deltaReceivedAudioBytes`, `deltaSentAudioBytes`, … (see source for the full set)
- Lifecycle: `joinedAt?`, `leftAt?`, `closedAt?`, `closed`, `get score()`
- Metadata: `browser?`, `engine?`, `platform?`, `operationSystem?`, `mediaDevices`, `mediaConstraints`
- `accept(sample, context?)`, `close()`

### `ObservedPeerConnection`

Key members:

- `readonly peerConnectionId: string`, `readonly client: ObservedClient`, `appData?`
- The 15 `observed*` sub-stat `Map`s (listed [above](#entity-hierarchy)), plus array getters:
  `codecs`, `inboundRtps`, `outboundRtps`, `remoteInboundRtps`, `remoteOutboundRtps`,
  `mediaSources`, `mediaPlayouts`, `dataChannels`, `peerConnectionTransports`, `iceTransports`,
  `iceCandidates`, `iceCandidatePairs`, `certificates`, `selectedIceCandidatePairs`,
  `selectedIceCandiadtePairForTurn`
- State: `connectionState?`, `iceConnectionState?`, `iceGatheringState?`, `usingTURN`, `usingTCP`
- Metrics: `currentRttInMs?`, `iceRttInMs?`, `rtcpRttInMs?`, `sfuHopRttInMs?`, `currentJitter?`,
  `availableIncomingBitrate`, `availableOutgoingBitrate`, sending/receiving bitrates, packet rates,
  and `total*` / `delta*` byte/packet counters
- `accept(pcSample, context?)`, `close()`, `get score()`

**Two different round trips — don't mix them.** `iceRttInMs` comes from ICE/STUN consent checks and
measures the trip to *whatever terminates ICE*: **in an SFU topology that is the SFU**, so it is the
client↔SFU leg. `rtcpRttInMs` comes from RTCP receiver reports and is an **end-to-end** media-path
round trip. They are not interchangeable, and averaging them together produces a number that moves
as streams come and go for reasons unrelated to the network. `currentRttInMs` therefore *prefers*
RTCP and falls back to ICE — always one kind within a tick, never a blend. `sfuHopRttInMs`
(`rtcp − ice`) estimates everything past the SFU, which separates "this client's last mile is slow"
from "the path beyond the SFU is slow".

**Counter-reset boundaries.** Chrome resets an SSRC's cumulative counters when the codec switches
([crbug/webrtc/5361](https://bugs.chromium.org/p/webrtc/issues/detail?id=5361), open since 2015),
which otherwise shows up as a sawtooth spike or a negative bitrate. `ObservedInboundRtp` /
`ObservedOutboundRtp` therefore set **`counterResetBoundary`** on any tick where `codecId`,
`encoder`/`decoderImplementation` or `scalabilityMode` changed, and suppress every delta for that
tick. Without this, a room-wide codec rollout fires a synchronized fake-degradation alert across
every participant at once.

**Remote-RTP correlation (derived).** During `accept()`, receiver/sender reports are linked
to the local streams by `remoteId` (fallback SSRC) and surfaced as fields:

- on `ObservedOutboundRtp`: `remoteRttInMs?`, `remoteFractionLost?`, `remoteJitter?`, `remotePacketsLost?`
- on `ObservedInboundRtp`: `remoteRttInMs?`, `remoteBytesSent?`, `remotePacketsSent?`, `remoteTimestamp?`

These are reset each tick and only set when the matching remote report is present.

---

## Schema types (`ClientSample`)

The shape of an accepted sample (re-exported from this package; identical to
`@observertc/schemas`). Only the top level is shown — each stat object mirrors the standard
WebRTC `getStats()` dictionaries plus a few extensions.

```ts
type ClientSample = {
  timestamp: number;          // client wall-clock (ms epoch)
  callId?: string;            // set by you or the library
  clientId?: string;          // set by you or the library
  score?: number;             // optional client-computed score (0..5)
  attachments?: Record<string, unknown>;
  peerConnections?: PeerConnectionSample[];
  clientEvents?: ClientEvent[];
  clientIssues?: ClientIssue[];
  clientMetaItems?: ClientMetaData[];
  extensionStats?: ExtensionStat[];
};

type PeerConnectionSample = {
  peerConnectionId: string;
  attachments?: Record<string, unknown>;   // e.g. { direction: 'send'|'recv', producerId, consumerId, label }
  score?: number;
  inboundTracks?; outboundTracks?;
  codecs?;
  inboundRtps?; remoteInboundRtps?;
  outboundRtps?; remoteOutboundRtps?;
  mediaSources?; mediaPlayouts?;
  peerConnectionTransports?; dataChannels?;
  iceTransports?; iceCandidates?; iceCandidatePairs?;
  certificates?;
};

type ClientEvent     = { type: string; payload?: string; timestamp?: number; /* +ids */ };
type ClientIssue     = { type: string; payload?: string; timestamp?: number };
type ClientMetaData  = { type: string; payload?: string; timestamp?: number; /* +ids */ };
type ExtensionStat   = { type: string; payload?: string };
```

`payload` fields are JSON strings; the library parses the ones it understands.

**`ClientEventTypes`** (enum of known `event.type` values): `CLIENT_JOINED`, `CLIENT_LEFT`,
`PEER_CONNECTION_OPENED/CLOSED/STATE_CHANGED`, `MEDIA_TRACK_ADDED/REMOVED/MUTED/UNMUTED/RESUMED`,
`ICE_GATHERING_STATE_CHANGED`, `ICE_CONNECTION_STATE_CHANGED`, `DATA_CHANNEL_OPEN/CLOSED/ERROR`,
`NEGOTIATION_NEEDED`, `SIGNALING_STATE_CHANGE`, `ICE_CANDIDATE`, `ICE_CANDIDATE_ERROR`, and the
mediasoup set `PRODUCER_*` / `CONSUMER_*` / `DATA_PRODUCER_*` / `DATA_CONSUMER_*`.

**`ClientMetaTypes`** (enum of known meta `type` values): `MEDIA_CONSTRAINT`, `MEDIA_DEVICE`,
`MEDIA_DEVICES_SUPPORTED_CONSTRAINTS`, `USER_MEDIA_ERROR`, `LOCAL_SDP`, `OPERATION_SYSTEM`,
`ENGINE`, `PLATFORM`, `BROWSER`.

### Worked example: a real `ClientSample`

Two consecutive samples from one participant ("Guest" in room `qq0iwfnd`) of an
edumeet/mediasoup call show what actually flows through `accept()`: a rich **join snapshot**,
then lean **steady-state ticks**.

**Sample 1 — the join snapshot.** Carries the one-off lifecycle `clientEvents` and device
`clientMetaItems` alongside the first stats. (Abbreviated; ids and times are from the real log.)

```jsonc
{
  "timestamp": 1780572332518,
  "callId":   "d3dbf2f5-79be-4cb8-9d43-fb404f07ef27",
  "clientId": "c926983c-4468-4046-ae8c-a9cabe1a1868",
  "score": 0,                                          // no quality measured yet on the join tick
  "attachments": { "displayName": "Guest", "roomId": "qq0iwfnd", "actualSessionId": "d3dbf2f5-…" },

  "clientEvents": [                                     // chronological lifecycle (12 in the real sample)
    { "type": "CLIENT_JOINED",                 "timestamp": 1780572324515 },
    { "type": "PEER_CONNECTION_OPENED",        "timestamp": 1780572326790 },   // pc=b81c8d9d (media)
    { "type": "ICE_GATHERING_STATE_CHANGED",   "timestamp": 1780572326811 },   // → gathering
    { "type": "PEER_CONNECTION_STATE_CHANGED", "timestamp": 1780572326812 },   // → connecting
    { "type": "PRODUCER_ADDED",                "timestamp": 1780572326821 },   // producer=1abdaf82 (audio)
    { "type": "MEDIA_TRACK_ADDED",             "timestamp": 1780572326821 },   // track=36ae42df  (audio)
    { "type": "PEER_CONNECTION_STATE_CHANGED", "timestamp": 1780572326827 },   // → connected
    { "type": "PRODUCER_ADDED",                "timestamp": 1780572326837 },   // producer=ba06a35b (video)
    { "type": "DATA_PRODUCER_CREATED",         "timestamp": 1780572326853 }
  ],

  "clientMetaItems": [                                  // environment & devices, one-off (10 in the real sample)
    { "type": "USER_AGENT_DATA", "payload": "{…Chrome 148 / macOS…}" },
    { "type": "MEDIA_DEVICE",    "payload": "{…\"BRIO 4K Stream Edition\"…}" }
    // …mic / camera / speaker devices…
  ],

  "peerConnections": [
    {
      "peerConnectionId": "b81c8d9d-…",                // the media PC — Guest publishes to the SFU
      "outboundRtps":      [ /* audio + video */ ],
      "outboundTracks":    [ /* mic + camera: label, settings, capabilities */ ],
      "remoteInboundRtps": [ /* RTCP feedback from the SFU */ ],
      "codecs": [ /* … */ ], "iceTransports": [ /* … */ ],
      "iceCandidatePairs": [ /* … */ ], "dataChannels": [ /* … */ ]
    },
    { "peerConnectionId": "8635acb7-…", "peerConnectionTransports": [ /* … */ ] }  // signaling-only PC
  ]
}
```

What `accept()` does with it, in order — each step emits on the bus with full ancestry:

1. lazily creates the `ObservedCall` → **`call-added`**;
2. creates the `ObservedClient` → **`client-added`**, then **`client-joined`** (from `CLIENT_JOINED`);
3. creates an `ObservedPeerConnection` per entry → **`peer-connection-added`** (×2 here);
4. creates an `ObservedOutboundTrack` per track → **`outbound-track-added`**, plus the matching
   **`outbound-rtp-added`**;
5. replays the device list as **`client-metadata`** events and the lifecycle items as
   **`client-event`**; and finally **`client-updated`** for the whole tick.

`attachments.roomId` lands on `observedClient.attachments` (read it on `client-updated`, **not** at
creation — see [Ingestion](#ingestion-accept-context--lifecycle)).

**Sample 2 — a steady-state tick** (~8 s later): same `callId` / `clientId`, **no** new
`clientEvents` or `clientMetaItems`, just refreshed `peerConnections` stats. Each PC now scores `5`
and the aggregate client `score` is `4.74` — a healthy call. This is the shape of nearly every
sample: each tick refreshes metrics and fires the `*-updated` events, while the heavy join
snapshot happens only once.

---

## Detectors (server-side extension point)

`observer-js` ships [ten detectors](#built-in-detectors), each an opt-in extension you register
explicitly with `addObserverDetector` / `addCallDetector` / `addDetector` (see
[Registering detectors](#registering-detectors)) — none are created automatically. All of them
correlate **across** the clients of a call or the calls of a fleet, because that is the only thing a
server can do better than a browser: per-client signals — packet loss, jitter, RTT, freezes — are
already detected on the client and arrive on samples as `clientIssues` (surfaced via `client-issue`).

Findings are raised as **`CallIssue`** or **`ObserverIssue`** — both share `IssueBase`: `{ type,
timestamp, conclusion?, payload? }` — and the payload is the **object**, not a JSON string. A
server-raised finding is delivered to an in-process handler, so there is nothing to serialise for:

```ts
observer.on('call-issue', ({ observedCall, issue }) => {
  issue.payload;                  // the object; no JSON.parse
  issue.conclusion?.faultDomain;  // a first-class field, not payload.conclusion
  issuePayloadAsString(issue);    // only at an edge that needs text (log, HTTP, queue)
});
```

(`ClientIssue`, the type on samples, keeps its string payload — that one really is a wire format.)

The registry is also an open extension point, on **`ObservedCall`**:

```ts
import { Observer, Detector } from '@observertc/observer-js';

class MyCrossClientDetector implements Detector {
  readonly name = 'my-detector';
  constructor(private readonly call /* : ObservedCall */) {}
  update() {                                   // called on every call.update()
    // …inspect this.call.observedClients across participants…
    if (/* condition only visible server-side */ false) {
      this.call.addIssue({ type: this.name, payload: { /* … */ }, timestamp: Date.now() });
      // → emitted on the bus as 'call-issue'
    }
  }
}

const observer = new Observer();
observer.on('call-added', ({ observedCall }) => {
  observedCall.detectors.add(new MyCrossClientDetector(observedCall));
});
observer.on('call-issue', ({ observedCall, issue }) => { /* react */ });
```

### Client issues: the lifecycle, and the division of labour

The most important thing to understand about detection in this library is **what it deliberately
does not do**. A client running
[`client-monitor-js`](https://github.com/ObserveRTC/client-monitor-js) already ships ~20 detectors
that decide *what is wrong with that endpoint* — `congestion`, `cpulimitation`, `audio-concealment`,
`freezed-video-track`, `keyframe-storm`, `video-decoder-overloaded`, `stuck-decoder`,
`ice-disconnected`, and so on. Those verdicts are better than anything re-derived from raw counters
server-side, because they carry hysteresis and multi-signal confirmation: `audio-concealment`
subtracts silent concealment (raw `concealedSamples` rises during ordinary silence, so a naive
detector flags every quiet moment); `audio-jitter-buffer-stress` requires the buffer to be grown
**and** NetEQ to be time-stretching (a grown buffer alone means NetEQ is *succeeding*);
`ice-disconnected` only fires once `disconnected` has persisted, so the blips ICE heals on its own
never surface.

**observer-js does not repeat that work.** Its job is the question no browser can answer: *who else
is in this state right now, what do they have in common, and where in publisher → SFU → subscriber
does the fault begin?*

#### The wire format

From client-monitor-js **4.6.0** the whole issue lifecycle reaches the server. A stateful issue
arrives as two `clientIssues[]` entries sharing a `key`:

```
raise:      { type: 'stuck-decoder',          key, payload,                                 timestamp: raisedAt }
resolution: { type: 'stuck-decoder-resolved', key, payload: { raisedAt, comment, …final },  timestamp: resolvedAt }
```

The observer opens an entry in `observedClient.activeIssues` on the raise and closes it on the
matching key, emitting **`client-issue-resolved`** with the finished interval. Handled for you:

- the `-resolved` **suffix** is stripped, so both entries share one logical `type`;
- a **re-raise** of a live key refreshes the payload without restarting `raisedAt`;
- **keyless** entries are one-shot — reported via `client-issue`, never tracked;
- issues still open when a client closes are **force-resolved** (`resolvedBy: 'client-closed'`), and
  the registry additionally expires stale entries, so a crashed participant can't leave an issue
  "active" forever.

#### Why intervals beat windows

This turns point-in-time symptom reports into **intervals**, and that is the whole game. *"Several
clients reported congestion in the last 10 seconds"* is a heuristic that has to guess whether the
symptoms are still happening. *"Several clients are congested **right now, simultaneously**"* is
ground truth, because the client says when the episode ends. Overlapping intervals are far stronger
evidence of a shared cause than near-in-time reports.

```ts
observer.on('client-issue', ({ observedClient, issue }) => { /* opened (or one-shot) */ });
observer.on('client-issue-resolved', ({ resolvedIssue }) => {
  resolvedIssue.type;          // 'stuck-decoder' — suffix stripped
  resolvedIssue.durationInMs;  // how long the episode lasted
  resolvedIssue.resolvedBy;    // 'client' | 'timeout' | 'client-closed'
});

// the live per-client mirror
observedClient.activeIssues;   // ObservedClientIssueRegistry, keyed by issue.key
```

> **client-monitor-js >= 4.6.0 is required** for every issue-driven detector. There is no fallback
> path that infers these conditions from raw counters — the client decides better, and maintaining a
> worse second implementation to be polite to old clients is how both end up wrong. Issues without a
> `key` have no lifecycle (nothing could ever close them), so they stay one-shot: reported on
> `client-issue`, never registered.

#### `ActiveIssuesRegistry` — issues are **pushed**, not polled

A detector does not go looking for the issues it cares about. It implements `ActiveIssueTracker` and
registers for the types it consumes; the registry hands them over as they open and close.

```ts
observedCall.activeIssuesRegistry   // this meeting
observer.activeIssuesRegistry       // the fleet; every call's registry propagates into it

observer.activeIssuesRegistry.addIssueTracker('congestion', myDetector);
observer.activeIssuesRegistry.removeIssueTracker(myDetector);

registry.values();   // the open issues in this scope, oldest first
registry.size;       // how many
```

The cost of a detector is then proportional to the issues it actually receives, not to the number of
participants: a healthy 500-client fleet does no per-tick work at all, because nothing was pushed.

**There is no wildcard.** A tracker names its types and sees nothing else. "Feed me everything and
I'll work out what matters" moves the decision from the application — which knows its client build
and its issue vocabulary — onto a detector that has to guess, and it makes the cost of a
subscription unbounded and invisible. If a detector should watch five types, list five types.

Onset spread is measured on the **observer clock**, never the client's. `raisedAt` comes from each
participant's own machine, and comparing those across clients makes clock skew look like a
synchronized infrastructure event.

### Observer-level detectors (cross-call / SFU-wide)

Some findings only exist **above** call scope — "many calls on the same SFU degraded at once" is far
more actionable than fifty individual client alerts. The same detector registry exists on the `Observer`,
runs on every `observer.update()`, and raises findings through `observer.addIssue(...)`, surfaced on
the bus as **`observer-issue`**:

```ts
observer.detectors.add({
  name: 'sfu-wide-degradation',
  update: () => {
    const degradedCalls = [ ...observer.observedCalls.values() ].filter(isDegraded);

    if (observer.numberOfCalls > 3 && degradedCalls.length / observer.numberOfCalls > 0.6) {
      observer.addIssue({ type: 'SFU_WIDE_QUALITY_DEGRADATION', timestamp: Date.now() });
    }
  },
});

observer.on('observer-issue', ({ issue }) => alert(issue));
```

### Publisher → subscribers: the resolver links

The question a single browser can never answer is *"did **everyone** receiving Alice see the same
degradation?"*. The join is the publisher↔subscriber links maintained by a
[`RemoteTrackResolver`](#remote-track-resolution-mediasoup--sfu), and detectors walk them directly:

```ts
outboundTrack.remoteInboundTracks;      // Set<ObservedInboundTrack> — every subscriber of this source
inboundTrack.remoteOutboundTrack;       // the publisher, or undefined if unlinked
inboundTrack.getInboundRtp();           // that receiver's RTP stats
observedCall.unconsumedOutboundTracks;  // published tracks with no subscriber at all
```

> A `TrackDistributionAggregator` class used to sit in front of these links and summarise every
> published track against all of its receivers, on every tick. It is gone. It scanned the majority
> (all published tracks) to find the interesting minority, which is the wrong axis — the detectors
> now start from the handful of *affected* tracks the issue registry pushed at them and resolve only
> those. The statistics helpers it used (`percentile`, `median`, `summarize`, `counterDelta`,
> `robustZScore`, `SlidingWindow`, `TrendTester`) are all still exported for building your own.

### Call health: `CallHealthAggregator`

The **client** axis. Where the resolver links answer "how was *this source* delivered?", this asks
"how is *each participant* doing, sending vs receiving?":

```ts
import { CallHealthAggregator } from '@observertc/observer-js';

const health = new CallHealthAggregator(observedCall).aggregate();

health.degradedRatio;             // 0.82 — the number that distinguishes shared faults from individual ones
health.inboundDegradedRatio;      // receiving side → egress/downstream suspicion
health.outboundDegradedRatio;     // sending side  → ingress suspicion
health.rttInMs?.median;           // percentile rollups, never means
health.qualityLimitation;         // { cpu, bandwidth, other } client counts
health.clients;                   // per-client entries with `reasons`, direction flags, TURN/TCP
```

### Registering detectors

**Nothing is created implicitly.** A `new Observer()` has zero detectors. There is no detector
configuration in `ObserverConfig` and no default set — an application says what it wants to watch, or
it watches nothing.

```ts
const observer = new Observer({
  createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
});

// observer-scoped (cross-call) — built immediately onto `observer.detectors`
observer.addObserverDetector('observer-concurrent-issue-detector', {
  issueTypes: [ 'congestion', 'ice-disconnected', 'ice-connection-failed' ],
  minAffectedCalls: 3,
});
observer.addObserverDetector('turn-server-outage-detector', { minClientsAtPeak: 10 });

// call-scoped — recorded in `observer.callDetectorConfigs`, applied to every call created AFTER this
observer.addCallDetector('call-concurrent-issue-detector', {
  issueTypes: [ 'congestion', 'ice-disconnected' ],
});
// one specific call
observedCall.addDetector('issue-fan-out-detector', { issueTypes: [ 'freezed-video-track' ] });
```

Every `add*` is **chainable** — it returns the owning entity:

```ts
observer
  .addObserverDetector('turn-server-health-detector')
  .addObserverDetector('turn-server-outage-detector', { minClientsAtPeak: 10 })
  .addValidator('remote-track-resolver');
```

#### Removing them

By **name**, on the entity — which removes *every* instance under that name:

```ts
observer.removeObserverDetector('turn-server-outage-detector');   // → 1
observer.removeCallDetector('call-concurrent-issue-detector');    // stops it everywhere
observedCall.removeDetector('issue-fan-out-detector');            // this call only
```

By **instance**, through the registry — which is where instances live, since `add*` returns the
entity rather than the detector:

```ts
observer
  .addObserverDetector('client-population-issue-detector', { issueTypes: [ 'cpulimitation' ], groupBy: 'browser' })
  .addObserverDetector('client-population-issue-detector', { issueTypes: [ 'cpulimitation' ], groupBy: 'operationSystem' });

const [ byBrowser, byOs ] = observer.detectors.getAll('client-population-issue-detector');

observer.detectors.remove(byOs);   // keeps the browser axis running
```

`Detectors` is a small collection: `instances` (a copy, in registration order), `listOfNames`,
`size`, `get(name)`, `getAll(name)`, `has(name)`, `add(detector)`, `remove(detector)`,
`removeByName(name)`, `clear()`, and it is iterable — `for (const detector of call.detectors)`.
`instances` being a copy is deliberate: removing while iterating the live array would skip entries,
and "drop the ones that look like X" is the most natural thing to want to write.

Two things worth knowing:

- **By name removes every instance under it**, not the first. A name can legitimately be registered
  more than once — `ClientPopulationIssueDetector` is meant to be added once per `groupBy` axis — and
  "remove whichever is first in the array" is not something a caller can predict from a name. Go via
  `detectors.getAll(name)` + `detectors.remove(instance)` when you mean one of them.
- **`removeCallDetector` affects calls already open, by default.** Otherwise whether a detector runs
  would depend on when a call happened to join, which is not a state anyone can reason about. Pass
  `{ includeOpenCalls: false }` to change only what future calls are built with.

Every removal path calls the detector's `close()`, so it unsubscribes from the issue registry and
drops any timers or bus listeners. A detector removed without closing would keep being fed matching
issues for the life of the call — invisible, unbounded, and it would still look healthy if you
inspected it.

Detectors are named by their kebab-case `NAME`, and the name types the config — an unknown name or a
key that belongs to a different detector will not compile. Each detector owns its defaults in its own
constructor, beside the doc explaining what each threshold means; there is no central table to keep
in sync.

> **Why no defaults?** A detector nobody asked for is a detector nobody will act on. It costs time on
> every tick and raises findings into a handler that was not written to expect them. Earlier versions
> auto-created everything from a three-state config slot; the result was applications receiving
> finding types they had never heard of.

Every issue-driven detector takes an explicit, non-empty `issueTypes` (or
`publisherIssueTypes`/`receiverIssueTypes`). There is no "watch everything" option — see
[the registry](#activeissuesregistry--issues-are-pushed-not-polled).

> **🔗 marks detectors that require a
> [`RemoteTrackResolver`](#remote-track-resolution-mediasoup--sfu).** They reason about a published
> track and its subscribers, so without the publisher↔subscriber links they see nothing and stay
> **silent forever** — which looks exactly like "no problems found". Configure
> `ObserverConfig.createRemoteTrackResolver`, and start the
> [`remote-track-resolver` validator](#validators--one-shot-structural-checks) to prove it is wired.

### Built-in detectors

They consume the verdicts `client-monitor-js` >= 4.6.0 already ships (raise + `<type>-resolved`) and
add only the cross-participant conclusion. **None re-derives a per-endpoint verdict from raw
counters** — that is the rule the whole design hangs on:

> **If a condition is detectable on the client, the client's issue is the source of truth.**

| Detector | 🔗 | Scope | Raises |
|----------|:--:|-------|--------|
| `CallConcurrentIssueDetector` | | call | `CONCURRENT_CLIENT_ISSUES`, `ISSUE_ONSET_BURST` |
| `ObserverConcurrentIssueDetector` | | **observer** | `CROSS_CALL_CONCURRENT_ISSUES`, `CROSS_CALL_ISSUE_ONSET_BURST` |
| `IssueFanOutDetector` | 🔗 | call | `PUBLISHED_TRACK_ISSUE_FAN_OUT`, `SINGLE_RECEIVER_ISSUE` |
| `PublisherFaultCorroborationDetector` | 🔗 | call | `CORROBORATED_PUBLISHER_FAULT` |
| `TrackDeliveryMismatchDetector` | 🔗 | call | `PUBLISHED_TRACK_NOT_DELIVERED`, `RECEIVER_TRACK_NOT_DELIVERED`, `PUBLISHER_TRACK_DRY` |
| `UnconsumedTrackDetector` | 🔗 | call | `UNCONSUMED_PUBLISHED_TRACK` |
| `ClientPopulationIssueDetector` | | **observer** | `CLIENT_POPULATION_ISSUE` |
| `SfuCongestionDetector` | | **observer** | `sfu-congestion` |
| `TurnServerHealthDetector` | | **observer** | `TURN_SERVER_DEGRADED` |
| `TurnServerOutageDetector` | | **observer** | `TURN_SERVER_OUTAGE` |

What each adds that no endpoint can know:

- **`CallConcurrentIssueDetector`** — *who else in this meeting is in this state right now?* The
  difference between "one person's Wi-Fi" and "this room is broken".
- **`ObserverConcurrentIssueDetector`** — *is our infrastructure in trouble?* A **separate class**,
  not the call one with a bigger denominator, because it is a different question with different
  gates. It requires the group to span at least `minAffectedCalls` **independent calls** (default
  `2`) and raises its own `CROSS_CALL_*` types. Without that gate, one thirty-person meeting where
  everyone is congested clears every client threshold and pages you for a single bad room the
  call-scoped detector already reported. Clients in different calls share no room, no publisher and
  no host — only the servers, which is what makes the finding conclusive. Note there is deliberately
  **no participant ratio** at this scope: six broken calls out of forty is a small share of all
  clients, and a ratio gate would hide exactly the event you want.
- **`IssueFanOutDetector`** — *does this issue follow one published source, or one receiver?*
- **`PublisherFaultCorroborationDetector`** — *do **both ends** of one track agree the source is at
  fault?* Fan-out sees one end and infers; this sees the publisher reporting `encoder-bottleneck`
  about its own send path *while* its subscribers report `freezed-video-track` about receiving it.
  Two independent parties, one conclusion, nothing left to deduce — hence the highest confidence in
  the library. Run both: fan-out is broader and catches the case where the publisher is fine and the
  SFU's forwarding is not.
- **`ClientPopulationIssueDetector`** — *is this concentrated on one **kind of client**?* The one
  correlation here that is neither per-call nor per-server. Every other observer-scoped detector
  reasons "clients in unrelated calls share only the infrastructure, so it must be us" — right for
  network symptoms, **wrong for endpoint ones**. `cpulimitation` across six unrelated calls is not an
  SFU event; CPU is owned by the endpoint, so what those endpoints share is a browser version or a
  client release. Groups by `browser` / `engine` / `platform` / `operationSystem`, one axis per
  instance. The gate is **relative risk**, not share: "30% of Chrome 141 is unhappy" means nothing if
  30% of everyone is, and a share-based rule simply indicts whichever browser is most popular.
- **`SfuCongestionDetector`** — *is congestion spiking across the fleet right now?* Counts distinct
  clients reporting congestion in fixed wall-clock buckets and compares each bucket against a
  median+MAD baseline of the ones before it. Buckets rather than update ticks on purpose: the tick is
  unevenly spaced and shorter than a client's sampling period, so counting on it compares windows of
  different lengths and calls the difference a signal. Only add it when the observer's calls all come
  from the **same SFU** — the finding's meaning is "these clients share only that server".
- **`TrackDeliveryMismatchDetector`** — *are the two ends of a track disagreeing?*
- **`UnconsumedTrackDetector`** — *is anyone actually subscribed?* (reads the resolver's silence)
- **`TurnServerHealthDetector`** — *does trouble cluster on one relay?*
- **`TurnServerOutageDetector`** — covers the case the health detector structurally cannot. The
  health detector groups clients by the server relaying them and asks how many report issues — it
  needs clients *on* the server to ask. When a TURN server dies, allocation fails: existing sessions
  drop and new clients never obtain a relay candidate through it, so they are never attributed to it
  at all. Its population goes to zero and the health detector falls silent for the worst possible
  reason. **Degradation makes clients unhappy; an outage makes them disappear.** Absence is a
  dangerous signal, so the **control group** is the heart of the design: a call ending, everyone
  leaving at 6pm, and a fleet-wide network event all look identical to an outage. It refuses to blame
  a server unless clients *not* relayed through it are demonstrably still connected
  (`requireControlGroup`, on by default).

#### There is no ICE detector

ICE trouble is reported by `client-monitor-js` >= 4.6.0 as the keyed issues `ice-disconnected`,
`ice-connection-failed`, `ice-transport-stalled` and `unstable-ice-path`, each with hysteresis and
multi-signal confirmation behind it. An `IceDisruptionDetector` used to re-derive that server-side
from raw state transitions; it has been removed, because the server sees less and guesses more. The
client knows whether `disconnected` persisted or healed in 200 ms; the observer does not.

Correlating ICE trouble is now configuration, not a class:

```ts
observer.addObserverDetector('observer-concurrent-issue-detector', {
  issueTypes: [ 'ice-disconnected', 'ice-connection-failed', 'ice-transport-stalled' ],
});
```

### Validators — one-shot structural checks

Every detector above answers *"is something wrong right now?"* and runs on every tick, because the
answer legitimately changes. A **validator** answers *"is this deployment built correctly?"* — which
only changes when you deploy. So it is not configured on and left running: you **start** one, it runs
until it can decide, reports once, and the observer drops it.

```ts
observer.addValidator('simulcast-receivers', { minChecks: 5 });

observer.on('validation-ready', ({ validator, report }) => {
  if (!report.ready) return;
  if (report.verdict === 'layer-decided-lowest-common-denominator') page(validator, report);
});

onDeploy(() => observer.addValidator('simulcast-receivers'));   // check again
```

`observer.validators` is the set currently running — normally empty, since each removes itself on
finishing. There is no revalidation timer: a deploy, not elapsed time, is what makes a structural
verdict stale, so re-checking means starting another.

**Cancelling.** A check that has not decided can be stopped, by name or by instance:

```ts
observer.cancelValidator('simulcast-receivers', 'sfu redeployed');

// or one specific instance — `observer.validators` holds what is running
for (const validator of observer.validators) observer.cancelValidator(validator, 'shutting down');
```

Cancelling is **not** silent discarding. The validator finishes `inconclusive` with your reason,
emits `validation-ready` like any other completion, and removes itself. That matters twice over:
anything waiting on the verdict would otherwise wait forever, and *"we stopped asking"* is a
materially different outcome from *"we asked and learned nothing"* — which is exactly what an
`inconclusive` carrying a reason records. Pass a real reason; the default tells the reader nothing
they could not already infer. `observer.close()` cancels whatever is still running with
`'observer closed'`.

| Validator | `addValidator` name | Question | Also raises |
|-----------|---------------------|----------|-------------|
| `SimulcastReceiverValidator` 🔗 | `simulcast-receivers` | Does the SFU pick layers per receiver, or drag the publisher down to the worst one? | `WORST_RECEIVER_CONTAGION` |
| `RemoteTrackResolverValidator` | `remote-track-resolver` | Is the resolver actually linking anything? | `REMOTE_TRACK_LINKS_UNRESOLVED` |
| `CodecConsistencyValidator` | `codec-consistency` | Is everyone on the same codec — and is it the one you think you negotiated? | `CODEC_INCONSISTENCY` |

**`SimulcastReceiverValidator`** — simulcast (or SVC) exists so one slow
participant doesn't set everyone's quality: with several encodings the server hands the struggling
receiver a lower layer and leaves the rest alone. Without it — or with a server that relays RTCP end
to end, so the publisher's bandwidth estimate collapses to the slowest receiver — the only way to
serve them is to make the *source* send less. Both causes look identical from outside; what the check
establishes is whether per-receiver adaptation happens at all.

| `verdict` | meaning |
|-----------|---------|
| `layer-decided-per-receiver` | verified — a receiver fell far behind and the publisher carried on |
| `layer-decided-lowest-common-denominator` | the publisher followed its worst receiver; everyone gets the slowest participant's quality |
| `inconclusive` | cancelled, or the observer closed, before it could decide |

**Not finishing is not a pass.** The check only runs when a publisher has 3+ receivers and one is at
most half the median; plenty of healthy deployments never present that. A validator that never sees it
simply keeps running and never reports — it does not quietly succeed. `report.checks` counts the times
the check genuinely ran, so an `inconclusive` with `checks: 0` says plainly that nothing was verified.

**`RemoteTrackResolverValidator`** exists because of a specific, nasty failure mode. Four things here
are built on publisher↔subscriber links — `IssueFanOutDetector`,
`PublisherFaultCorroborationDetector`, `TrackDeliveryMismatchDetector`, `UnconsumedTrackDetector`
(and `SimulcastReceiverValidator`) — and every one of them correctly does *nothing* when the links
are missing rather than guessing. So a resolver wired to the wrong id field leaves all of them
permanently silent, and **silence is what a healthy deployment looks like too**: you would conclude
your calls were clean when in fact nothing was ever examined. Verdicts: `links-resolved` /
`no-links-resolved` / `inconclusive`. Run it at start-up and after changing the resolver or the SFU's
id scheme.

**`CodecConsistencyValidator`** answers two things at once. A **split** — participants of one call on
different codecs — is a real fault with a confusing symptom: an SFU that forwards without transcoding
cannot serve them all, so some pairs see each other and some do not, with no error anywhere. Only
something holding every participant at once can see it. The quieter half is the silent fallback: a
deployment configured for VP9 or AV1 drops to VP8 whenever one endpoint cannot negotiate the
preference, the call keeps working at a higher bitrate than budgeted, and the team believes it
shipped AV1 months ago. Give it `expected` and it says so. Verdicts: `codec-consistent` /
`codec-split` / `unexpected-codec` / `inconclusive`.

```ts
observer.addValidator('remote-track-resolver');
observer.addValidator('codec-consistency', { expected: { video: 'video/VP9', audio: 'audio/opus' } });
```

#### `CallIssue` vs `ObserverIssue`

Server-raised findings come in two kinds, distinguished by the scope that raised them:

| | raised by | delivered as | `scope` |
|---|---|---|---|
| `CallIssue` | `observedCall.addIssue(...)` | `call-issue` | `'call'` |
| `ObserverIssue` | `observer.addIssue(...)` | `observer-issue` | `'observer'` |

Both share `IssueBase` — `type`, `timestamp`, `conclusion?`, `payload?` — and `Issue` is the union,
discriminated on `scope`.

```ts
observer.on('call-issue', ({ observedCall, issue }) => {
  issue.scope;              // 'call'
  observedCall.callId;      // the call — NOT repeated in the payload
  issue.conclusion?.faultDomain;
  issue.payload;            // evidence only
});

observer.on('observer-issue', ({ issue }) => {
  issue.scope;              // 'observer'
});
```

`scope` is stamped by `addIssue` rather than asked of the detector: it is a fact about *where the
finding was raised*, which the entity knows and a detector should not have to restate. Having it on
the issue — not merely implied by which event fired — keeps a finding self-describing once it leaves
the bus, into a shared handler, a log line or a queue.

**The payload is evidence and nothing else.** It no longer repeats `type`, `scope`, or the `callId`
already carried by the event, and `conclusion` was lifted out of it to a first-class field. A payload
that restates its own envelope invites the two to disagree — and they did, because nothing kept them
in step. `payload` is always an object (the `string` form is gone, along with `issuePayloadOf`); use
`issuePayloadAsString(issue)` at a boundary that genuinely needs text.

#### Conclusions

Every issue-driven finding carries a `conclusion` — the interpretation step, so the person reading
the alert doesn't have to perform it. It sits **beside** the evidence, not inside it:

```jsonc
{
  "type": "CROSS_CALL_ISSUE_ONSET_BURST",
  "scope": "observer",
  "timestamp": 1739812345678,
  "conclusion": {
    "faultDomain": "infrastructure",
    "summary": "network congestion is open across independent calls at the same time — 6 of 40 calls (11/300 clients)",
    "recommendation": "check SFU egress bandwidth and host network saturation before looking at any single participant",
    "confidence": 0.85
  },
  "payload": {
    "issueType": "congestion",
    "calls": 40, "affectedCalls": 6,
    "perCall": [ { "callId": "…", "affectedClients": 4, "totalClients": 9 } ]
  }
}
```

`faultDomain` is one of `infrastructure`, `call`, `published-track`, `endpoint`, `client-population`
or `unknown`, and it comes from the **spread**, not the issue type — congestion in one call is a
meeting problem, congestion in six calls is a server problem, and the client reported the identical
symptom in both.

One case is worth knowing about because it inverts the usual reading: **`cpu-limitation` spread
across many independent calls concludes `client-population`, not `infrastructure`.** Endpoint CPU is
owned by the endpoint, so breadth there points at what those endpoints share — a recent client
release, a browser version, shared VDI hardware — and paging the SFU on-call would be wrong. The
conclusion table encodes that so nobody has to rediscover it during an incident.

Unknown issue types (your own custom client detectors) still produce a structurally valid conclusion
from the spread alone; they just get generic wording.

Two functions are exported, one per scope: `concludeCallIssue()` and `concludeObserverIssue()`. They
are separate because a detector already knows its scope, and a single generic function forced every
caller to pass the other scope's fields as placeholders — call-scoped detectors passing
`affectedCalls: 1, totalCalls: 1` forever, observer-scoped ones passing a participant ratio that was
deliberately never read. Placeholders like that invite being read as if they meant something.

#### Cost

Detectors run inside `call.update()`, on your event loop, so their cost matters. Two things keep it
off the participant axis:

- **Issues are pushed, not polled.** A detector holds only what the registry handed it, so an
  `update()` that finds `size === 0` — the overwhelmingly common case — costs one comparison,
  whatever the participant count. Nothing iterates clients looking for trouble.
- **So are unconsumed tracks.** `observedCall.unconsumedOutboundTracks` is maintained by the resolver
  as tracks gain and lose subscribers, so `UnconsumedTrackDetector` reads a set that is normally
  empty instead of walking every published track (529 µs → 65 µs per tick at 1 200 tracks).
- **Track lookups start from the affected minority.** A detector resolving an issue to its published
  track searches the *reporting client's* peer connections (typically one or two), not the call.

At 20 calls × 12 participants (2 640 subscriptions) the whole detector pass costs ~1.3 ms per tick.
`yarn bench` prints a per-detector breakdown for your own shape.

#### Worked examples

[`examples/detectors.ts`](./examples/detectors.ts) (`yarn example:detectors`) runs one scenario per
detector — the question it answers, its full config, the synthetic traffic that makes it fire, and
the finding with its conclusion. It asserts every expected finding is produced, so it doubles as a
smoke test. [`examples/sfu-observer.ts`](./examples/sfu-observer.ts) (`yarn example`) is the end-to-end
tour instead: ingest → correlate → react, with the mediasoup wiring alongside.

#### `TrackDeliveryMismatchDetector` — resolving an ambiguous symptom

A dry track ("no bytes are arriving") is the clearest symptom there is and, on its own, completely
ambiguous. A receiver seeing silence cannot distinguish *the camera was switched off* from *the SFU
stopped forwarding* from *my own consumer wedged* — all three look identical from the browser.

Joining the two ends of the published track resolves it:

| publisher | subscribers | verdict |
|---|---|---|
| sending | **all** dry | `PUBLISHED_TRACK_NOT_DELIVERED` — the forwarding path |
| sending | **some** dry | `RECEIVER_TRACK_NOT_DELIVERED` — those consumers (in mediasoup: recreate them) |
| dry | any dry | `PUBLISHER_TRACK_DRY` — the source stopped; **not** an SFU fault |

The publisher side is judged from both available signals: its own `dry-outbound-track` issue when the
client reports one, and the observed outbound RTP (`deltaPacketsSent`) as fallback and corroboration.
That combination is what makes the first row trustworthy — the server can state that packets
demonstrably left the publisher during the same interval in which every receiver got nothing.

This is the "SFU forwarding mismatch" check, and it needs **no mediasoup instrumentation at all** —
the clients' own dry-track verdicts plus the resolver links are sufficient.

#### `UnconsumedTrackDetector` — reading the resolver's silence

The one detector where the *absence* of links is the signal: a track still pushing packets whose
`remoteInboundTracks` set is empty, i.e. uplink and SFU ingress spent on media nobody receives
(everyone has the publisher hidden, a simulcast layer no viewer selects, or an app that forgot to
stop a track). It waits `minUnconsumedDurationInMs` first, since a gap between publishing and the
first subscription is normal at join time.

Note the trap this one has to guard against, and why it checks `call.remoteTrackResolver` at runtime
rather than trusting the flag alone: **"no subscribers" and "no resolver configured" produce the
identical observation.** Without a resolver it would report every published track in the call as
unconsumed.

## Call summaries

Everything else in this library is about *now*. Detectors answer "is something wrong right now",
validators answer a structural question once, and both read state the call throws away when it ends.
A **call summary** is the one thing that outlives the call: who was in it, what was raised against
it, how it scored — the questions asked *after* the meeting, by support, by billing, by whoever is
writing the incident note.

It is configured on the observer, at construction:

```ts
const observer = new Observer({
  callSummary: {
    include: [ 'clients', 'issues', 'turnServers', 'scores' ],
  },
});

observer.on('call-summary', ({ summary }) => archive(summary));
```

Omit `callSummary`, or set it to `null`, and there are no summaries and **not one extra bus
subscription**. Pass an object — `{}` is valid — and every call this observer creates carries one.

> **Why construction-time, when detectors are added per call?** A summary is a record of what
> happened, and a record you can switch on halfway through is a record with a hole in it. Calls that
> started before the switch would carry different sections from calls that started after, with
> nothing on either to say which. One shape for every call, or none.

### Sections are opt-in, and absence means "not collected"

`include` picks from four built-ins, and **the default is `[]`** — none of them:

| Section | Contains |
|---------|----------|
| `clients` | `clientIds` (join order), `peak`, `joined`, `left`. Identifiers and counts only |
| `issues` | `CallIssue[]`, in the order raised, capped by `maxIssues` |
| `turnServers` | `serverUrls` that carried media, and `clientsRelayed` |
| `scores` | `min` / `max` / `median` of the call score, and `samples` |

**A missing section means it was never collected — never "nothing happened".** Reading
`summary.issues === undefined` as "this call was clean" is the one misreading this type invites, so
there is no default-empty section to make it easy. This is the same rule as `inconclusive` on a
validator: silence is not success.

The `clients` section is deliberately identifiers and counts. Anything *about* a client — browser,
platform, region — is already on `observedClient` while the call is live, and belongs in
`attachments` via an enricher if you want it kept; see below.

### Enrichers: fold in anything, from any call-scoped event

```ts
new Observer({
  callSummary: {
    include: [ 'issues' ],
    enrich: {
      'client-joined': (summary, { observedClient }) => {
        // serialisable facts only — the region string, never the live object it came from
        ((summary.attachments.regions ??= []) as string[]).push(String(observedClient.appData.region));
      },
    },
  },
});
```

Each enricher is typed against its own event's payload. Only **call-scoped** events are accepted —
the ones carrying an `observedCall`. An enricher on `observer-issue` or `validation-ready` will not
compile, because there is no single call to attribute a fleet-wide fact to, and quietly writing it
into every open summary would be worse than a type error.

The library never writes to `summary.attachments`, so nothing you put there can collide with a
section added in a future version.

> **Why `attachments` and not `appData`.** `appData` is live working state hung off an entity for
> that entity's lifetime, and it may hold things that cannot be serialised — a mediasoup router, a
> socket. A summary is the opposite: it outlives the call so it can be **shipped**, and it reaches
> you on `call-summary` while the call it describes is being torn down, so an unserialisable value
> in it points at something already gone. Same contract as `attachments` on a `ClientSample`: read
> the live object off `observedCall` / `observedClient` in the enricher, attach what serialises —
> the router's `id`, not the router. An enricher that throws is logged and skipped — a summary is a
side-channel, and nothing about a call should break because a field could not be recorded.

### Caps announce what they dropped

`maxIssues` (default `500`) and `maxClientIds` (default `10_000`) bound the two unbounded lists.
When either bites, `summary.truncated` appears with the shortfall — present **only** when something
was actually dropped. That is what makes dropping safe: the true count is recoverable as
`issues.length + (truncated?.issues ?? 0)`. A silently truncated summary is worse than no summary,
because someone will count `issues.length` and report it as the issue count.

`issues` is the plain array, with no derived tallies alongside it. A count is `issues.length` and a
per-type count is one `filter` — both cheaper at the call site than kept correct here.

### Reading it

`observedCall.summary` is live: read it at any point during the call. It is also delivered once on
`call-summary`, emitted **inside** `close()` while the call is still in `observer.observedCalls` —
after that the call is gone and there is nothing left to ask. `observer.close()` closes its calls
first and its collector afterwards, so every summary still makes it out.

Cost is **one bus listener per subscribed event type, for the whole observer** — not one per call. A
per-call design would be quadratic in concurrent calls: at 500 calls and eight events, 4 000
listeners each doing 500 no-op invocations per event. Percentiles are computed once, at close.

## Remote track resolution (mediasoup / SFU)

In an SFU, one participant's **outbound** track is delivered to other participants as **inbound**
tracks (one **publisher** → many **subscribers**). Correlation is **opt-in** per observer: set
`ObserverConfig.createRemoteTrackResolver`, a factory invoked when each call is created that returns the
call's `RemoteTrackResolver` (or `undefined` for none).

`RemoteTrackResolver` is a generic, strategy-driven class. It subscribes to the bus (filtered to
its call) and links tracks by **publisher id** — the link key — maintaining the links directly on
the tracks: `inboundTrack.remoteOutboundTrack` and `outboundTrack.remoteInboundTracks: Set`.

```ts
import { Observer, createDefaultMediasoupRemoteTrackResolverFactory } from '@observertc/observer-js';

const observer = new Observer({
  createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
});

// later, given tracks (links are kept up to date as tracks come and go):
const source    = inboundTrack.remoteOutboundTrack;       // the publishing ObservedOutboundTrack
const receivers = [ ...outboundTrack.remoteInboundTracks ]; // the subscribing ObservedInboundTrack[]
```

Two built-in factories ship: `createDefaultMediasoupRemoteTrackResolverFactory()` (publisher =
`attachments.producerId`, subscriber = `attachments.consumerId`) and
`createP2pRemoteTrackResolverFactory()` (matches by RTP **SSRC**, preserved end-to-end in p2p).

For any other topology, build a `RemoteTrackResolver` with your own key resolvers — the publisher
id is just whatever links a subscribed track to the published one:

```ts
import { Observer, RemoteTrackResolver } from '@observertc/observer-js';

const observer = new Observer({
  createRemoteTrackResolver: (observedCall) => new RemoteTrackResolver(observedCall, {
    resolveOutboundTrackPublisherId: (out) => out.attachments?.mediaId as string | undefined,
    resolveInboundTrackPublisherId:  (inb) => inb.attachments?.mediaId as string | undefined,
    resolveInboundTrackSubscriberId: (inb) => inb.attachments?.subId  as string | undefined, // optional
  }),
});
```

For the mediasoup factory, the application puts `producerId` / `consumerId` (and optionally
`direction`, `label`) into the track `attachments`.

---

## Mediasoup router observation

Everything above is built from the **client-reported** `ClientSample`. When you run a
[mediasoup](https://mediasoup.org) SFU you also have the **server's own** ground truth — its
routers, transports, producers, consumers and data channels, with exact lifetimes and state
transitions. `ObservedMediasoupRouter` captures that server-side view into a
**`MediasoupRouterSample`**, completely independent of the client sample pipeline.

### The concept

You hand the observer a live mediasoup `Router`; it attaches to mediasoup's own `observer` API and,
from then on, **passively tracks** the router's topology and lifecycle — with no polling and no
changes to your media code:

- new transports (`webrtc` / `plain` / `pipe` / `direct`), their selected `tuple`, ICE/DTLS/SCTP
  state transitions and `connectedAt`;
- producers (codec, SSRCs/RIDs, `pause`/`resume`) and consumers (`pause`/`resume`,
  `producerPaused`/`producerResumed`);
- data producers and data consumers;
- `createdAt` / `closedAt` for every entity above.

It keeps all of this **in memory**, in a single `MediasoupRouterSample` exposed as
`observedRouter.sample` — see [`src/schema/MediasoupRouter.ts`](./src/schema/MediasoupRouter.ts). The
sample **accumulates for the life of the router**: closed transports/producers/consumers are kept
(with their `closedAt` set), not removed. Read it whenever you like — it's a plain object you own.

### Memory & large meetings

This is intentionally the **simplest** approach — everything lives in memory and nothing is sampled
or evicted for you. That's fine for typical rooms, but be aware of the cost at scale:

- **Consumers grow as O(N²)** on a single flat router: with `N` participants each producing audio +
  video and consuming everyone else, the sample holds roughly `2·N·(N−1)` consumer records (≈ 19,800
  for `N` = 100).
- The sample is **cumulative** — closed entities and their `history` are retained — so it also grows
  with call duration and churn (renegotiation, simulcast layer changes, rejoins).

A 100-participant flat router can therefore reach tens of MB and keep growing. There is **no built-in
sink, snapshotting, or eviction** — by design. **If you run large meetings, do your own sampling:**
on your own cadence read `observedRouter.sample` (snapshot/serialize/persist what you need), drop what
you don't, and close routers you no longer track. (mediasoup also typically shards routers across
workers/cores, which keeps any one router small.)

### Extending the sample, and building your own report

The sample is yours to annotate. Every entity — the router, each transport, producer, consumer, data
producer and data consumer — has an `attachments?: Record<string, unknown>` slot, and there are three
ways to fill it, from most declarative to most ad-hoc.

**1. `enrich` — mirror mediasoup's own `appData`.** The common case: your application already keeps
`participantId`, `purpose` and similar on the mediasoup objects, and you want them on the sample.
Runs once per entity at creation, before the corresponding event:

```ts
observer.createObservedMediasoupRouter({
  router,
  enrich: {
    producer: (producer) => ({ participantId: producer.appData.participantId, purpose: producer.appData.purpose }),
    consumer: (consumer) => ({ subscriberId: consumer.appData.subscriberId }),
    transport: (transport) => ({ role: transport.appData.role }),
  },
});
```

A throwing enricher is caught and logged — it can't take the router's bookkeeping down with it.

**2. Lifecycle events — enrich on the fly.** Each entity announces itself as
`<entity>-sample-added` and `<entity>-sample-closed`, carrying **the live sample object** (not a
copy) plus the mediasoup object it came from. Mutating it in the handler is the intended pattern:

```ts
observedRouter.on('producer-sample-added', ({ sample, producer, transport }) => {
  sample.attachments = { ...sample.attachments, participantId: lookup(producer.id) };
});

observedRouter.on('producer-sample-closed', ({ sample }) => {
  archive(sample);   // its `closedAt` is set
});
```

Events: `transport-sample-added` / `-closed`, `producer-sample-added` / `-closed`,
`consumer-sample-added` / `-closed`, `data-producer-sample-added` / `-closed`,
`data-consumer-sample-added` / `-closed`.

**3. `attachTo(id, attachments)` — annotate later, from anywhere.** When the knowledge arrives after
the entity did (a signalling message, a database lookup that resolved):

```ts
observedRouter.attachTo(producerId, { participantId, joinedFrom: 'mobile' });   // merges
```

Ids are unique across mediasoup entity kinds, so one method covers all of them. It returns `false`
for an unknown id rather than failing quietly — which matters when application events race the
mediasoup ones. For direct access there are typed accessors: `getTransportSample(id)`,
`getProducerSample(id)`, `getConsumerSample(id)`, `getDataProducerSample(id)`,
`getDataConsumerSample(id)`. They index the *same* objects the arrays hold, so a lookup is O(1)
instead of a `sample.producers.find(...)` scan.

#### Building your own report

`observedRouter.sample` is live — arrays grow and `history` entries are appended as the router runs,
so a report built directly on it keeps changing after you think you're done. Use **`snapshot()`** for
a detached deep copy:

```ts
const report = {
  ...observedRouter.snapshot(),        // never moves again
  generatedAt: Date.now(),
  region: process.env.REGION,
};
```

> **Note on typing.** The sample types no longer carry a `Record<string, unknown>` index signature.
> That signature allowed arbitrary top-level keys but also silently accepted typos on real fields and
> weakened autocomplete. Custom data belongs in `attachments`, which is typed as such. If you were
> assigning ad-hoc keys directly onto a sample object, move them into `attachments`.

### Matching peer connections — by **event**, not by storage

The observer correlates the SFU side with the client side **at the peer-connection level**: a
mediasoup WebRTC transport and a client's `RTCPeerConnection` share the same id, so whenever an
observed peer connection's id matches one of the router's WebRTC transport ids, that's a match.

**The observer does not store the router (or its sample) on any entity.** Instead, for **every**
matching peer connection it emits **`mediasoup-router-matched-with-peer-connection`** and steps
back — *your application* decides what the pairing means. The payload carries the full peer-connection
ancestry, so you get the router **and** the matched `observedPeerConnection`, `observedClient` and
`observedCall` in one place. Stamp the `routerId` into the peer connection's / client's `appData`,
build your own index, attach the server sample to the call in your database — whatever fits.

This matching is **opt-in**: pass `matchPeerConnectionByWebRtcTransportId: true` to
`createObservedMediasoupRouter`. When enabled, as peer connections are observed
(`peer-connection-added`) the observer checks whether the peer connection's id is one of the router's
WebRTC transport ids; on a hit it emits — once per matching peer connection — and keeps watching, so a
router serving many participants emits one match per participant's transport. When the flag is omitted
or `false`, no matching is performed and the event never fires. The internal listener is removed
automatically when the router closes or the observer closes.

### Ordering contract — observe the router first

Matching is **forward-only by design**, and that is sufficient because the lifecycle ordering is
**guaranteed, not racy**:

- `ObservedMediasoupRouter` works purely by **subscribing to mediasoup's `observer` API**, so it can
  only see events that happen *after* it is created. You therefore create it the moment the router
  exists — **before** any transport is added to it — and it captures the rest going forward.
- A mediasoup transport is always created **on the server first**; only then can the client connect
  to it, produce/consume, and begin shipping `ClientSample`s. So a peer connection — and the
  `peer-connection-added` event it triggers — can never appear before its server-side WebRTC
  transport already exists (and has been observed by the router).

Put together: by the time a `peer-connection-added` fires, the router has already recorded that
transport's id in `webrtcTransportIds`, so a single forward-looking listener catches every match. No
back-scan of existing peer connections and no re-check on transport creation are needed — the
observer deliberately does **not** look backwards.

**Your responsibility:** call `createObservedMediasoupRouter(...)` as early as the router exists
(before transports are added or samples are accepted). If you register the router *after* its
transports are created or after the client's first sample, those events are already in the past and
the corresponding matches are missed.

When the underlying mediasoup router closes, its `close` propagates to `ObservedMediasoupRouter`,
which sets the sample's `closedAt` and emits **`mediasoup-router-removed`** — your cue to read /
persist the final `observedRouter.sample` and drop your reference to it.

### Options — `observer.createObservedMediasoupRouter(settings)`

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `router` | `mediasoup.types.Router` | yes | the live router to observe; the observer attaches to `router.observer`. `.id` and the sample's `routerId` come from `router.id` |
| `appData` | `Record<string, unknown>` | no | application-owned bag on the `ObservedMediasoupRouter` |
| `attachments` | `Record<string, unknown>` | no | free-form data; carried on `sample.attachments` |
| `matchPeerConnectionByWebRtcTransportId` | `boolean` | no | opt in to peer-connection matching: emit `mediasoup-router-matched-with-peer-connection` for each peer connection whose id matches one of the router's WebRTC transport ids. Omitted / `false` → no matching, the event never fires |

Peer-connection matching is **off by default**; enable it with
`matchPeerConnectionByWebRtcTransportId: true`. Returns the `ObservedMediasoupRouter`, or `undefined`
if the observer is closed (a router with the same id returns the existing instance — both warn).

Useful members on the returned object: `.sample` (the in-memory `MediasoupRouterSample`, with
`createdAt` / `closedAt?` on it), `.appData`, `.attachments`, `.webrtcTransportIds: Set<string>`,
`.id`, `.close()`.

### Example

```ts
import { Observer, InMemorySink } from '@observertc/observer-js';
import type { ObservedMediasoupRouterScope, ObservedPeerConnectionScope } from '@observertc/observer-js';

const observer = new Observer();

// 1) Feed client samples as usual so the observer knows about calls, clients & peer connections.
//    (e.g. transport-layer: observer.accept(clientSample, context))

// 2) Observe the SFU side; opt in to peer-connection matching. State accumulates in `.sample`.
const router = /* your mediasoup router */ undefined as any;
const observedRouter = observer.createObservedMediasoupRouter({
  router,
  matchPeerConnectionByWebRtcTransportId: true,
});

// For large meetings, sample it yourself on your own cadence (see "Memory & large meetings"):
// setInterval(() => persist(observedRouter.sample), 10_000);

// 3) Every peer connection whose id matches one of the router's WebRTC transport ids fires this —
//    WE decide what to do with each pairing. The payload carries the full ancestry.
observer.on('mediasoup-router-matched-with-peer-connection',
  ({ observedMediasoupRouter, observedCall, observedPeerConnection }:
     ObservedMediasoupRouterScope & ObservedPeerConnectionScope) => {
    (observedPeerConnection.appData ??= {}).routerId = observedMediasoupRouter.id;
    myStore.linkRouterToCall(observedCall.callId, observedMediasoupRouter.id);
  },
);

// 4) The router closed — read/persist the final state, then drop your reference.
observer.on('mediasoup-router-removed', ({ observedMediasoupRouter }: ObservedMediasoupRouterScope) => {
  persist(observedMediasoupRouter.sample);   // its `closedAt` is set
});
```

### Why event-driven matching instead of storing on the call

- **Loose coupling.** The call model stays about client telemetry; the SFU view lives on its own
  `ObservedMediasoupRouter` and is associated only if and how *you* choose.
- **You own the association.** One router serves many peer connections (across clients and calls),
  and the right place to keep that mapping is application-specific — so the observer hands you each
  peer-connection match and gets out of the way.
- **You own the sampling.** The router sample is plain in-memory state you read on your own terms;
  for large meetings, sample/persist it yourself (see [Memory & large meetings](#memory--large-meetings))
  rather than relying on the library to evict — it deliberately doesn't.

---

## Sinks (per-client sample persistence)

A **sink** receives the samples a client accepts — for archival, streaming, or later offline
replay. Each `ObservedClient` gets its **own** sink, produced by the
`ObserverConfig.createClientSink` factory when the client is created (return `undefined` for no
sink). The client pushes every accepted sample to its sink, and `end()`s it on close.

### The `ClientSampleSink` base class

`ClientSampleSink` is an **abstract base class** (a typed `EventEmitter`). You create a sink by
**subclassing it** and implementing `write` and `end`. It is **object-mode**: `write` receives
the `ClientSample` *object*, so each sink decides how (or whether) to serialize it — JSON line,
protobuf, a remote POST body, an in-memory push, etc.

```ts
import { ClientSampleSink, ClientSample } from '@observertc/observer-js';

abstract class ClientSampleSink /* extends EventEmitter */ {
  abstract write(sample: ClientSample): boolean;   // accept one sample; `false` = backpressure
  abstract end(): void;                            // flush; emit `close` when the destination is ready

  // typed events (inherited): the listener signature is inferred from the event name
  on(event: 'close' | 'finish' | 'drain', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  // ...and the matching `once` / `off` / `emit`
}
```

| Event | Meaning |
|-------|---------|
| `close` | the destination is fully written and closed (e.g. a file flushed and its fd closed) — "ready" |
| `error` | the destination failed |
| `finish` | `end()` was processed and queued data flushed (before `close`) |
| `drain` | the buffer drained after backpressure; safe to write more |

The library calls `write(sample)` **synchronously** per accepted sample (it is not awaited),
`end()`s the sink when the client closes, and attaches an `error` listener so a failing sink
can't crash the process (it also catches throws from `write`/`end`). The application — which
created the sink — listens for `close` (destination ready) and `error`. Because `write` isn't
awaited in the `accept()` hot path, **backpressure and batching are the sink's concern**.

### Built-in sinks

```ts
import { Observer, createJsonlFileSinkFactory } from '@observertc/observer-js';

const observer = new Observer({
  // one ./stats/<callId>__<clientId>.jsonl per client
  createClientSink: createJsonlFileSinkFactory({ directory: './stats' }),
});

// React when a sink is created for a client:
observer.on('client-sink-created', ({ observedClient, sink }) => {
  sink.on('close', () => {
    // the file is fully flushed and its fd closed — ready to upload, move, etc.
  });
});
```

| Export | Signature | Notes |
|--------|-----------|-------|
| `createJsonlFileSinkFactory` | `({ directory, flags?, getFileName?, serializeSample? }) => ClientSampleSinkFactory` | per-client JSONL files; path defaults to `${callId}__${clientId}.jsonl` under `directory` (which **must exist**) |
| `createJsonlFileSink` | `({ path, flags?, serializeSample? }) => ClientSampleSink` | a single JSONL file; wraps `fs.WriteStream` and re-emits its `close`/`finish`/`drain`/`error` |
| `JsonlFileSink` | `class extends ClientSampleSink` | the underlying class; exposes `readonly path` so a `close` handler knows which file is ready |
| `createInMemorySink` / `InMemorySink` | `(samples?: ClientSample[]) => InMemorySink` | collects the accepted **sample objects** into `.samples: ClientSample[]`; emits `close` on `end()` |

`serializeSample?: (sample: ClientSample) => string` overrides the default `JSON.stringify` for
the JSONL sinks (e.g. to redact or reshape before writing).

### Reading sink-specific info (e.g. the file path)

The bus hands you the sink as the base `ClientSampleSink`. To read information specific to a sink
type — for a file sink, where it was written — **narrow with `instanceof`** and read the sink's
public fields. `JsonlFileSink` exposes `path`:

```ts
import { JsonlFileSink } from '@observertc/observer-js';

observer.on('client-sink-created', ({ observedClient, sink }) => {
  if (sink instanceof JsonlFileSink) {
    const { path } = sink;                          // the file this client's samples go to
    sink.once('close', () => uploadFile(path));     // close = flushed & fd closed → ready
  }
});
```

The general pattern: each concrete sink exposes whatever it wants as `public readonly` fields, and
consumers narrow (`instanceof YourSink`) to read them. Your own sinks do the same.

### Writing your own sink

Subclass `ClientSampleSink` and emit the lifecycle events yourself — for any non-file
destination (a remote endpoint, a message queue, an object store, …):

```ts
import { ClientSampleSink, ClientSample, ClientSampleSinkFactory } from '@observertc/observer-js';

class HttpSink extends ClientSampleSink {
  private buffer: ClientSample[] = [];
  constructor(private readonly url: string) { super(); }

  write(sample: ClientSample): boolean {
    this.buffer.push(sample);                  // batch; decide your own backpressure
    return true;
  }
  end(): void {
    fetch(this.url, { method: 'POST', body: JSON.stringify(this.buffer) })
      .then(() => this.emit('close'))          // signal "destination ready"
      .catch((err) => this.emit('error', err));
  }
}

const createClientSink: ClientSampleSinkFactory = ({ clientId, observedCall }) =>
  new HttpSink(`https://stats.example.com/${observedCall.callId}/${clientId}`);

const observer = new Observer({ createClientSink });
```

`observedClient.sink?` exposes the created sink; the `client-sink-created` event delivers it on
the bus with full ancestry. `ClientSampleSinkFactory` is
`(p: { clientId: string; observedCall: ObservedCall }) => ClientSampleSink | undefined`.

---

## Injecting data into a client

Sometimes the application holds data that belongs on a client's record but isn't part of the
client-reported `ClientSample` — a room id or display name, an application-level event
(*"recording started"*), a server-detected issue, an extension stat, or a device/meta item.
`ObservedClient` exposes **injection** methods that merge such data into the client's sample stream,
so it updates the live model **and** is persisted to the client's
[sink](#sinks-per-client-sample-persistence) exactly like sampled data.

| Method | Adds to the sample's | Surfaces as |
|--------|----------------------|-------------|
| `injectAttachment(attachments)` | `attachments` (merged via `Object.assign`) | `observedClient.attachments` |
| `injectEvent(event: ClientEvent)` | `clientEvents` | `client-event` (plus any state the event drives) |
| `injectIssue(issue: ClientIssue)` | `clientIssues` | `client-issue` |
| `injectMetaData(meta: ClientMetaData)` | `clientMetaItems` | `client-metadata` |
| `injectExtensionStat(stat: ExtensionStat)` | `extensionStats` | `client-extension-stats` |

### When the injected data lands

Injection is timing-aware so nothing is dropped, regardless of *when* you call it:

- **During a sample's processing** — e.g. from inside a `client-updated` / `client-event` handler,
  which run within `accept()` — the data is applied to the **current** sample immediately: reflected
  in entity state and written to the sink as part of that sample.
- **Between samples** — the data is buffered and merged into the **next** `accept()`'s sample.
- **On `close()` with pending injections and no further sample** — the buffer is flushed as a final
  synthetic sample (applied to state and written to the sink) before the sink is ended, so a
  last-moment injection is never lost.

In every case the injected data both updates the live `ObservedClient` and reaches the per-client
sink — the sink always receives the final, **injection-merged** sample (the sink write happens at the
end of `accept()`, after the merge).

### Example

```ts
// Enrich at creation from your app's knowledge of the participant. Injecting in `client-added`
// (which runs just before the first accept) lands on the first sample.
observer.on('client-added', ({ observedClient }) => {
  observedClient.injectAttachment({ roomId: lookupRoomId(observedClient.clientId) });
});

// Application-level signals at any time:
const client = observer.getObservedCall(callId)?.getObservedClient(clientId);
client?.injectEvent({ type: 'RECORDING_STARTED', timestamp: Date.now() });
client?.injectIssue({ type: 'app-kicked-participant', timestamp: Date.now() });
```

`attachments` are latest-wins (like sampled `attachments`): injecting a key overwrites its previous
value. `appData` is unaffected — injections flow into the sample/telemetry, not the app-owned
`appData` bag (see [Ingestion](#ingestion-accept-context--lifecycle)).

## Logging

`observer-js` logs through a single, swappable sink. Out of the box it writes `debug` and
above to `console` (verbose — install your own sink for production). Funnel everything into your
logger:

```ts
import { setObserverLogger, type ObserverLogger } from '@observertc/observer-js';

setObserverLogger({
  trace: (m, ...a) => myLogger.trace(`[${m}]`, ...a),
  debug: (m, ...a) => myLogger.debug(`[${m}]`, ...a),
  info:  (m, ...a) => myLogger.info(`[${m}]`, ...a),
  warn:  (m, ...a) => myLogger.warn(`[${m}]`, ...a),
  error: (m, ...a) => myLogger.error(`[${m}]`, ...a),
});
```

`createLogger(moduleName)` is also exported for your own modules. See
**[`docs/logging.md`](./docs/logging.md)** for pino / winston / console recipes, level
filtering, per-module routing, and full silencing.

---

## Design notes

**[`docs/design-notes.md`](./docs/design-notes.md)** covers the reasoning behind the library rather
than its API: why client-detectable conditions are never re-derived server-side, why each shipped
detector exists, what was deliberately *not* built and why, the WebRTC domain facts that shaped the
implementation (ICE-Lite disconnect waves, counter resets, why ICE and RTCP RTT must never be
blended), and an operational threshold reference.

---

## Error-handling philosophy

The library **warns and degrades; it does not throw** on operational problems:

- `createObservedCall` / `createObservedClient` on a closed parent → warn + return `undefined`.
- Duplicate id → warn + return the **existing** instance.
- `accept()` on a closed client → warn + no-op.
- Sample missing `callId`/`clientId`, or observer closed → `sample-rejected` event.
- A throwing accept-middleware → warn + drop that sample (never crashes `accept()`).

Therefore `create*` and `getOrCreate*` return `T | undefined`; **guard the result.** The
`Middleware` utility's internal invariants (e.g. calling `next()` twice) throw, but those throws
are caught by `accept()` and surfaced as a warning.

---

## Development & extension guide

```bash
yarn install
yarn build       # tsup → dist/ (dual ESM .mjs + CJS .js, single entry, .d.ts/.d.mts + sourcemaps)
yarn lint        # eslint -c .eslintrc.json "src/**/*.ts"
yarn typecheck   # tsc --noEmit
yarn test        # jest
```

The build is driven by [`tsup`](https://tsup.egoist.dev) (config in `tsup.config.ts`): a single
entry (`src/index.ts`), dual ESM + CommonJS output to `dist/` (`index.mjs` / `index.js`) with
`.d.mts` / `.d.ts` types and sourcemaps, targeting Node 20. CI (`.github/workflows/ci.yml`) runs
lint + typecheck + **build** + test on every push/PR.

**Project layout** (`src/`): `Observer.ts`, `ObservedCall.ts`, `ObservedClient.ts`,
`ObservedPeerConnection.ts`, the `Observed*` sub-stat classes, `ObserverEvents.ts` (the typed
event map + scope types), `detectors/` (`Detector`, `Detectors`, and one file per detector),
`validators/` (`Validator`, `Validators`, one file per validator), `issues/` (`ActiveClientIssue`,
`ActiveIssueTracker`, `ActiveIssuesRegistry`, `ObservedClientIssueRegistry`), `scores/`,
`resolvers/` (remote-track resolvers), `utils/` (`stats`, `SlidingWindow`, `TrendTester`,
`CallHealthAggregator`), `common/` (`logger`, `utils`, `Middleware`), `schema/`
(sample/event/meta types), and `sinks/` (the `ClientSampleSink` base + `JsonlFileSink` /
`InMemorySink`, re-exported from the package root).

**Conventions to follow when developing further:**

- *Single event bus.* New consumer-facing events go in `ObserverEvents.ts` with an object
  payload `[<Scope> & { …subject }]`, and are emitted via the component's
  `_notify(type, { ...this.eventScope, …subject })`. Each component has a precomputed
  `eventScope` field and a thin `_notify` wrapper around the right emitter. Keep purely internal
  coordination as **local** EventEmitter events (and remember to `off` them on close).
- *Warn, don't throw* on operational/edge conditions; return `undefined` where a value can't be produced.
- *Counter-reset-safe deltas.* When computing a delta from a cumulative counter, never emit a
  negative value (guard `curr >= prev`), to survive counter resets / SSRC reuse.
- *Explicit accumulation.* The per-sample metric accumulation in `accept()` is intentionally
  explicit and not abstracted — match that style.
- *Detectors are server-side.* Add cross-client detectors on `ObservedCall.detectors`; don't
  re-implement client-detectable signals.

**Recipes:**

- *Add an event:* add the key + payload to `ObserverEvents`; in the owning component call
  `this._notify('my-event', { ...this.eventScope, subject })`.
- *Add a per-stream metric:* add the field to the relevant `Observed*Rtp`/track class, populate
  it in its `update()` (reset at the top of `update()` if it's per-tick), and read it from a
  `*-updated` handler.
- *Add a detector:* implement `Detector`, register it on `call-added` via
  `observedCall.detectors.add(...)`, surface findings with `observedCall.addIssue(...)`.

---

## License

Apache-2.0. Part of the [ObserverTC](https://github.com/observertc) ecosystem.
