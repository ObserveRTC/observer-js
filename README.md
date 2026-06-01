# ObserverTC — `@observertc/observer-js`

[![NPM version](https://img.shields.io/npm/v/@observertc/observer-js.svg)](https://www.npmjs.com/package/@observertc/observer-js)
[![License](https://img.shields.io/npm/l/@observertc/observer-js.svg)](https://github.com/observertc/observer-js/blob/main/LICENSE)

`observer-js` is a **server-side Node.js library for monitoring WebRTC sessions**. A WebRTC
application (typically an SFU or a signaling/stats backend) feeds it `ClientSample` objects —
periodic snapshots of each participant's `RTCPeerConnection.getStats()` output plus
application events — and `observer-js` maintains a live, in-memory model of every call,
participant, peer connection, and media stream, derives per-interval and cumulative metrics,
and emits a single, unified stream of typed events the application can react to.

> **Status:** `1.0.0-beta`. The API described here is current and intended to be implemented
> against directly. This document is written to be self-sufficient: an engineer (or an AI
> agent) should be able to integrate the library, or develop it further, from this file alone.
> A companion doc, [`docs/logging.md`](./docs/logging.md), covers logging integration in depth.

---

## Table of contents

1. [Installation](#installation)
2. [Mental model](#mental-model)
3. [Quick start](#quick-start)
4. [Data flow](#data-flow)
5. [Entity hierarchy](#entity-hierarchy)
6. [Ingestion: `accept()`, context & lifecycle](#ingestion-accept-context--lifecycle)
7. [Update policies](#update-policies)
8. [The event bus](#the-event-bus) ← the core of the API
9. [API reference](#api-reference)
10. [Schema types (`ClientSample`)](#schema-types-clientsample)
11. [Detectors (server-side extension point)](#detectors-server-side-extension-point)
12. [Remote track resolution (mediasoup / SFU)](#remote-track-resolution-mediasoup--sfu)
13. [Logging](#logging)
14. [Error-handling philosophy](#error-handling-philosophy)
15. [Public exports](#public-exports)
16. [Development & extension guide](#development--extension-guide)
17. [Not yet implemented / roadmap](#not-yet-implemented--roadmap)

---

## Installation

```bash
npm install @observertc/observer-js
# or
yarn add @observertc/observer-js
```

Requires **Node.js ≥ 16**. Written in TypeScript; ships type declarations (`lib/index.d.ts`).
Runtime dependencies: `@bufbuild/protobuf`, `events`, `uuid`. The library does **not** bundle a
logger or any transport — see [Logging](#logging).

`ClientSample` and friends are re-exported from this package, and are also published as the
shared schema in [`@observertc/schemas`](https://github.com/observertc/schemas); samples
produced on the client (e.g. by `@observertc/client-monitor-js`) conform to the same shape.

---

## Mental model

Five ideas are enough to use the whole library:

1. **One ingestion method.** `observer.accept(sample, context?)` is how data gets in.
   Calls, clients, and peer connections are created automatically the first time their id
   appears in a sample.

2. **A live entity tree.** `Observer → ObservedCall → ObservedClient → ObservedPeerConnection
   → {inbound/outbound RTP, tracks, data channels, ICE, codecs, …}`. Every node holds current
   and cumulative metrics and is reachable by id through `Map`s on its parent.

3. **One event bus.** Everything worth subscribing to is emitted on the **`Observer`** itself
   (it is an `EventEmitter`). Each event payload is an **object carrying the full ancestry**
   of the entity it came from. You never have to walk the tree to subscribe.

4. **Pull or react.** You can read fields off the entities at any time (pull), and/or react to
   events (push). The `*-updated` events fire on each processing tick.

5. **Warn, don't throw.** Operational problems (bad config, duplicate ids, closed entities,
   malformed samples) never throw; they warn through the pluggable logger and degrade
   gracefully (returning `undefined` or emitting `sample-rejected`).

---

## Quick start

```ts
import { Observer, ClientSample } from '@observertc/observer-js';

// 1. Create an observer.
const observer = new Observer({
  // how often the observer aggregates call/client metrics:
  updatePolicy: 'update-on-interval',
  updateIntervalInMs: 5000,
  // default policy applied to calls created automatically by accept():
  defaultCallUpdatePolicy: 'update-on-any-client-updated',
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

// 3. Feed samples. `context` (optional) is merged into the appData of any
//    call/client created lazily during this accept() — handy for tagging.
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
| `ObservedClient` | `call.createObservedClient(settings)` / lazily | `observedClients` | `observedPeerConnections: Map<string, ObservedPeerConnection>`, per-client metrics, `report` |
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

1. drops + emits `sample-rejected` if the observer is closed, or `callId`/`clientId` is missing;
2. gets or lazily creates the `ObservedCall` and `ObservedClient`;
3. shallow-merges `context` into the created/looked-up entity `appData`;
4. delegates to `client.accept(sample, context)`, which fans out to each
   `ObservedPeerConnection.accept(pcSample, context)`.

### `context` (the `AcceptContext`)

```ts
type AcceptContext = Record<string, unknown>;
```

A single, optional, free-form object threaded down the whole accept chain
(`Observer → Client → PeerConnection`). It is **merged into the `appData`** of entities that
are lazily created (or looked up) during the pass, so you can tag entities the first time you
see them (e.g. `{ studioVersion, sfuId }`). One object is used regardless of where it is
supplied. In addition to the `appData` merge, the most recent context is re-emitted as the
`context` field on the `*-updated` events at the call, client, and peer-connection levels
(`call-updated`, `client-updated`, `peer-connection-updated`).

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

## Update policies

"Update" means *recompute aggregated metrics and emit the `*-updated` event* at that level.
Both the observer and each call have a configurable trigger. The `update-on-interval` policy
**requires** an interval and this is enforced at compile time (a discriminated union); at
runtime a missing interval warns and falls back rather than throwing.

**Observer-level** (`ObserverConfig.updatePolicy`, default `update-when-all-call-updated`):

| Policy | Triggers `observer.update()` when… |
|--------|-------------------------------------|
| `update-on-any-call-updated` | any call updates |
| `update-when-all-call-updated` | every call has updated since the last observer update |
| `update-on-interval` | a timer fires (`updateIntervalInMs` required) |

**Call-level** (`ObservedCallSettings.updatePolicy`, defaulted from
`ObserverConfig.defaultCallUpdatePolicy`):

| Policy | Triggers `call.update()` when… |
|--------|--------------------------------|
| `update-on-any-client-updated` | any client in the call updates |
| `update-when-all-client-updated` | every client has updated since the last call update |
| `update-on-interval` | a timer fires (`updateIntervalInMs` required) |

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
type ObserverEventBase            = { observer: Observer };
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
| `observer-updated` | — | `observer.update()` ran (per the observer update policy) |
| `observer-closed` | — | `observer.close()` |
| `sample-rejected` | `{ reason: 'observer-closed' \| 'missing-callId' \| 'missing-clientId', sample: ClientSample }` | a sample was dropped by `accept()` |

#### Call level — scope `{ observer, observedCall }`

| Event | Extra | Fires when |
|-------|-------|-----------|
| `call-added` | — | a call is created |
| `call-updated` | `{ context?: AcceptContext }` | `call.update()` ran |
| `call-closed` | — | the call closed |
| `call-empty` | — | last client left the call |
| `call-not-empty` | — | first client joined a previously-empty call |
| `call-issue` | `{ issue: ClientIssue }` | `call.addIssue(...)` (server-side detector finding) |

#### Client level — scope `{ observer, observedCall, observedClient }`

| Event | Extra | Fires when |
|-------|-------|-----------|
| `client-added` | — | a client is created |
| `client-updated` | `{ sample: ClientSample, elapsedTimeInMs: number, context?: AcceptContext }` | the client processed a sample |
| `client-closed` | — | the client closed |
| `client-joined` | — | first `CLIENT_JOINED` event seen |
| `client-left` | — | `CLIENT_LEFT` seen (or inferred on close) |
| `client-rejoined` | `{ timestamp: number }` | a later `CLIENT_JOINED` after an earlier join |
| `client-issue` | `{ issue: ClientIssue }` | a client-reported issue arrived, or `client.addIssue(...)` |
| `client-metadata` | `{ metaData: ClientMetaData }` | a client meta item arrived |
| `client-extension-stats` | `{ extensionStats: ExtensionStat }` | an app-defined extension stat arrived |
| `client-event` | `{ event: ClientEvent }` | any client event was processed |
| `client-track-report` | `{ report: TrackReport }` | a track was removed; final per-track report |

#### Peer-connection level — scope `{ observer, observedCall, observedClient, observedPeerConnection }`

| Event | Extra | Notes |
|-------|-------|-------|
| `peer-connection-added` / `peer-connection-closed` | — | lifecycle of the PC |
| `peer-connection-updated` | `{ context?: AcceptContext }` | the PC processed a sample |
| `ice-connection-state-changed` / `ice-gathering-state-changed` / `connection-state-changed` | `{ state: string }` | driven by client events |
| `selected-candidate-pair-changed` | — | *declared; not currently emitted* |
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

type ObserverConfig<AppData = Record<string, unknown>> =
  ( { updatePolicy: 'update-on-interval'; updateIntervalInMs: number }
  | { updatePolicy?: 'update-on-any-call-updated' | 'update-when-all-call-updated'; updateIntervalInMs?: number }
  ) & {
    defaultCallUpdatePolicy?: ObservedCallSettings['updatePolicy'];
    defaultCallUpdateIntervalInMs?: number;
    appData?: AppData;
    closeClientIfIdleForMs?: number;
    closeCallIfEmptyForMs?: number;
  };
```

Key members:

- `accept(sample: ClientSample, context?: AcceptContext): void`
- `getObservedCall<T>(callId): ObservedCall<T> | undefined`
- `createObservedCall<T>(settings): ObservedCall<T> | undefined`
- `getOrCreateObservedCall<T>(settings): ObservedCall<T> | undefined`
- `update(): void` — force an aggregation/`observer-updated` tick
- `close(): void`
- `readonly observedCalls: Map<string, ObservedCall>`
- `readonly observedTURN: ObservedTURN`
- `get appData()`, `get numberOfCalls()`
- counters: `numberOfClients`, `numberOfClientsUsingTurn`, `numberOfInboundRtpStreams`,
  `numberOfOutboundRtpStreams`, `numberOfDataChannels`, `numberOfPeerConnections`,
  `totalAddedCall`, `totalRemovedCall`, `closed`
- `on/off/once/emit` typed against the [event map](#event-catalogue)

### `ObservedCall`

```ts
type ObservedCallSettings<AppData = Record<string, unknown>> =
  ( { updatePolicy: 'update-on-interval'; updateIntervalInMs: number }
  | { updatePolicy?: 'update-on-any-client-updated' | 'update-when-all-client-updated'; updateIntervalInMs?: number }
  ) & {
    callId: string;
    appData?: AppData;
    remoteTrackResolvePolicy?: 'p2p' | 'mediasoup-sfu' | 'none';
    closeCallIfEmptyForMs?: number;
  };
```

Key members:

- `readonly callId: string`, `appData: AppData`
- `readonly observedClients: Map<string, ObservedClient>`, `get numberOfClients()`
- `getObservedClient<T>(clientId)`, `createObservedClient<T>(settings)`, `getOrCreateObservedClient<T>(settings)` (all `… | undefined`)
- `addIssue(issue: ClientIssue): void` — raise a **call-level** issue → emits `call-issue`
- `readonly detectors: Detectors` — server-side detector registry (empty by default; see [Detectors](#detectors-server-side-extension-point))
- `scoreCalculator: ScoreCalculator`, `get score()`, `readonly calculatedScore`
- `remoteTrackResolver?: RemoteTrackResolver`
- aggregates: `numberOfIssues`, `numberOfPeerConnections`, `numberOfInboundRtpStreams`,
  `numberOfOutboundRtpStreams`, `numberOfDataChannels`, `maxNumberOfClients`,
  `clientsUsedTurn: Set<string>`, `startedAt?`, `endedAt?`, `closedAt?`, `closed`
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
- **Injection API** (queue app data to be merged into the next sample processing):
  `injectEvent(ClientEvent)`, `injectIssue(ClientIssue)`, `injectMetaData(ClientMetaData)`,
  `injectExtensionStat(ExtensionStat)`, `injectAttachment(key, value)`
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
- `readonly report: ClientReport` — cumulative report (byte/packet totals + RTT & score distributions)
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
- Metrics: `currentRttInMs?`, `currentJitter?`, `availableIncomingBitrate`,
  `availableOutgoingBitrate`, sending/receiving bitrates, packet rates, and `total*` / `delta*`
  byte/packet counters
- `accept(pcSample, context?)`, `close()`, `get score()`

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
type ClientIssue     = { type: string; payload?: string; timestamp?: number };   // also used for call-issue
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

`Reports` exported: `ClientReport` (cumulative per-client totals + RTT/score distributions) and
`TrackReport` (per-track final report, delivered on `client-track-report`).

---

## Detectors (server-side extension point)

`observer-js` deliberately ships **no built-in detectors**. Per-client signals — packet loss,
jitter, RTT, freezes, etc. — are already detectable on the client and arrive on samples as
`clientIssues` (surfaced via `client-issue`). Server-side detection should focus on what only
the server can see by **correlating data across the clients of a call**.

The hook lives on **`ObservedCall`**:

```ts
import { Observer, Detector } from '@observertc/observer-js';

class MyCrossClientDetector implements Detector {
  readonly name = 'my-detector';
  constructor(private readonly call /* : ObservedCall */) {}
  update() {                                   // called on every call.update()
    // …inspect this.call.observedClients across participants…
    if (/* condition only visible server-side */ false) {
      this.call.addIssue({ type: this.name, payload: JSON.stringify({ /* … */ }), timestamp: Date.now() });
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

`Detector` interface and the registry:

```ts
interface Detector { readonly name: string; update(): void; }

class Detectors {
  add(d: Detector): void;
  remove(d: Detector): void;
  clear(): void;
  update(): void;          // called by ObservedCall.update(); guards each detector in try/catch
  get listOfNames(): string[];
}
```

---

## Remote track resolution (mediasoup / SFU)

In an SFU, one participant's **outbound** track is delivered to other participants as **inbound**
tracks. To correlate them server-side, set `remoteTrackResolvePolicy: 'mediasoup-sfu'` on the
call settings. The built-in `MediasoupRemoteTrackResolver` subscribes to the bus (filtered to
its call) and maps producer↔consumer using track `attachments` (`producerId`, `consumerId`):

```ts
const call = observer.createObservedCall({ callId, remoteTrackResolvePolicy: 'mediasoup-sfu' });
// later, given an inbound track:
const source = inboundTrack.getRemoteOutboundTrack();     // the producing ObservedOutboundTrack
const consumers = outboundTrack.getRemoteInboundTracks(); // the consuming ObservedInboundTrack[]
```

Custom topologies can implement the `RemoteTrackResolver` interface and assign
`call.remoteTrackResolver`:

```ts
interface RemoteTrackResolver {
  resolveRemoteOutboundTrack(inboundTrack: ObservedInboundTrack): ObservedOutboundTrack | undefined;
  resolveRemoteInboundTracks(outboundTrack: ObservedOutboundTrack): ObservedInboundTrack[] | undefined;
}
```

The application is expected to put `direction` (`'send'`/`'recv'`), `producerId`, `consumerId`,
and `label` into `PeerConnectionSample.attachments` / track `attachments`.

---

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

## Error-handling philosophy

The library **warns and degrades; it does not throw** on operational problems:

- Bad config (`update-on-interval` without an interval) → warn + safe fallback policy.
- `createObservedCall` / `createObservedClient` on a closed parent → warn + return `undefined`.
- Duplicate id → warn + return the **existing** instance.
- `accept()` on a closed client → warn + no-op.
- Sample missing `callId`/`clientId`, or observer closed → `sample-rejected` event.

Therefore `create*` and `getOrCreate*` return `T | undefined`; **guard the result.** The only
remaining `throw`s are internal invariants in the unused `Middleware` utility.

---

## Public exports

```ts
// Entry: src/index.ts
export { Observer } from './Observer';
export type { ObserverEvents, SampleRejectedReason, AcceptContext } from './Observer';
export type { ObserverEventBase, ObservedCallScope, ObservedClientScope, ObservedPeerConnectionScope } from './ObserverEvents';

export { ObservedCall, ObservedClient, ObservedPeerConnection } from './…';
export { ObservedInboundTrack, ObservedOutboundTrack } from './…';
export { ObservedInboundRtp, ObservedOutboundRtp, ObservedRemoteInboundRtp, ObservedRemoteOutboundRtp } from './…';
export { ObservedMediaSource, ObservedMediaPlayout, ObservedCodec, ObservedCertificate, ObservedDataChannel } from './…';
export { ObservedIceCandidate, ObservedIceCandidatePair, ObservedIceTransport, ObservedPeerConnectionTransport } from './…';

export { ClientSample, ClientIssue, ClientEvent, ClientMetaData } from './schema/ClientSample';
export { ClientEventTypes } from './schema/ClientEventTypes';
export { ClientMetaTypes } from './schema/ClientMetaTypes';

export { ScoreCalculator } from './scores/ScoreCalculator';
export { Detectors } from './detectors/Detectors';
export type { Detector } from './detectors/Detector';

export { createLogger, setObserverLogger } from './common/logger';
export type { Logger, ObserverLogger } from './common/logger';

export { Middleware } from './common/Middleware';
export type { TrackReport, ClientReport } from './Reports';
```

---

## Development & extension guide

```bash
yarn install
yarn build       # tsc → lib/
yarn lint        # eslint -c .eslintrc.json "src/**/*.ts"
yarn test        # jest
```

**Project layout** (`src/`): `Observer.ts`, `ObservedCall.ts`, `ObservedClient.ts`,
`ObservedPeerConnection.ts`, the `Observed*` sub-stat classes, `ObserverEvents.ts` (the typed
event map + scope types), `detectors/` (`Detector`, `Detectors`), `scores/`, `updaters/`
(update-policy strategies), `utils/` (remote-track resolvers), `common/` (`logger`, `utils`,
`Middleware`), `schema/` (sample/event/meta types).

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

## Not yet implemented / roadmap

For an agent continuing the work, these are explicitly **not** present yet:

- **Tests.** There is currently only a placeholder spec. The two `accept()` methods
  (`ObservedClient`, `ObservedPeerConnection`) are the priority for characterization tests.
- **CI gate** (lint + typecheck + test).
- **Built-in detectors / quality classifier.** The registry exists; concrete server-side
  detectors (e.g. producer→consumer delivery mismatch, quality outlier, asymmetric media) are
  to be designed.
- **Per-tick snapshot API.** A serializable snapshot per `*-updated` tick to replace consuming
  the fine-grained `*-updated` events (under consideration).
- **Monotonic-timestamp / clock-skew handling** for client clock jumps.
- **Batch `processSamples()`** entry point for offline analysis of recorded sample streams.
- **Expanded derived metrics** (jitter-buffer delay, concealment, freeze fraction, encode/decode
  CPU, quality-limitation breakdown, etc.) and first-class producer/consumer & PC-direction
  fields beyond `attachments`.

## License

Apache-2.0. Part of the [ObserverTC](https://github.com/observertc) ecosystem.
