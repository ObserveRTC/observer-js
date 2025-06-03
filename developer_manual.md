# Developer Manual - observer-js

## 1. General Description

`observer-js` is a Node.js library for monitoring WebRTC client data. It processes statistical samples from clients, organizes them into calls and participants, tracks a wide range of metrics, detects common issues, and calculates quality scores. This enables real-time insights into WebRTC session performance.

## 2. Core Concepts

### 2.1. Data Flow

1.  **Client-Side**: Your application collects WebRTC statistics (e.g., via `RTCPeerConnection.getStats()`).
2.  **Transformation**: These raw stats are transformed into the `ClientSample` schema defined by `observer-js`.
3.  **Ingestion**: The `ClientSample` is passed to the `observer.accept()` method.
4.  **Processing**: `observer-js` processes the sample, updating or creating relevant entities (`ObservedCall`, `ObservedClient`, `ObservedPeerConnection`, etc.) and their metrics.
5.  **Analysis**: Metrics are analyzed for issue detection and quality scoring.
6.  **Events**: Events are emitted for significant state changes, new issues, or updates.

### 2.2. Entity Hierarchy

- **`Observer`**: The root object, managing multiple calls and global settings.
  - **`ObservedCall`**: Represents a distinct call session.
    - **`ObservedClient`**: Represents an individual participant within a call.
      - **`ObservedPeerConnection`**: Represents a WebRTC RTCPeerConnection of a client.
        - **`ObservedInboundRtpStream` / `ObservedOutboundRtpStream`**: Tracks individual media streams.
        - **`ObservedDataChannel`**: Tracks data channels.
- **`ObservedTURN`**: Tracks global TURN server usage metrics across the observer.

### 2.3. Automatic Entity Creation

When `observer.accept(sample)` is called:

- If an `ObservedCall` for `sample.callId` doesn't exist, it's typically created.
- If an `ObservedClient` for `sample.clientId` within that call doesn't exist, it's typically created.
- Peer connections, streams, and data channels are similarly managed based on IDs in the sample.

### 2.4. Metrics Aggregation

The library aggregates a wide array of metrics at each level of the hierarchy, including (but not limited to):

- RTT, jitter, packet loss
- Bytes sent/received (audio, video, data)
- Codec information
- ICE connection details, TURN usage
- Stream/track states (muted, enabled)
- Frame rates, resolutions
- Bandwidth estimations

### 2.5. Issue Detection

A `Detectors` system analyzes metrics to identify common WebRTC issues (e.g., high packet loss, low audio levels, frozen video, connection setup problems). Issues are reported via events.

### 2.6. Quality Scoring

`ScoreCalculator` components assess the quality of calls and clients based on metrics and detected issues, typically resulting in a numerical score (e.g., 0.0 to 5.0).

### 2.7. Event-Driven Architecture

The library uses Node.js `EventEmitter` to signal various occurrences, allowing applications to react to changes in real-time.

## 3. API Reference

### 3.1. `Observer`

Manages all monitored calls and global observer state.

**Configuration (`ObserverConfig`)**

```typescript
export type ObserverConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	updatePolicy?: 'update-on-any-call-updated' | 'update-when-all-call-updated' | 'update-on-interval';
	updateIntervalInMs?: number; // Used if updatePolicy is 'update-on-interval'
	defaultCallUpdatePolicy?: ObservedCallSettings['updatePolicy'];
	defaultCallUpdateIntervalInMs?: number;
	appData?: AppData; // Custom data for this observer instance
};
```

**Constructor**

```typescript
new Observer<AppData>(config?: ObserverConfig<AppData>)
```

- `config`: Optional. Defaults: `updatePolicy: 'update-when-all-call-updated'`.

**Key Properties**

- `observedCalls: Map<string, ObservedCall>`: Active calls.
- `observedTURN: ObservedTURN`: Aggregated TURN metrics.
- `appData: AppData | undefined`: Custom application data.
- `closed: boolean`: True if `close()` has been called.
- Counters: `totalAddedCall`, `totalRemovedCall`, RTT buckets, `totalClientIssues`, `numberOfClientsUsingTurn`, `numberOfClients`, `numberOfPeerConnections`, etc.

**Key Methods**

- `createObservedCall<T>(settings: ObservedCallSettings<T>): ObservedCall<T>`
- `getObservedCall<T>(callId: string): ObservedCall<T> | undefined`
- `accept(sample: ClientSample): void`: A convenience method to feed WebRTC stats. If `sample.callId` and `sample.clientId` are provided, it will route the sample to the appropriate `ObservedCall` and `ObservedClient`, creating them if they don't exist. The core sample processing for an existing client happens within the `ObservedClient`'s own `accept` or update mechanism.
- `update(): void`: Manually trigger an update cycle (behavior depends on `updatePolicy`).
- `close(): void`: Cleans up resources for the observer and all its calls.
- `createEventMonitor<CTX>(ctx?: CTX): ObserverEventMonitor<CTX>`: For contextual event listening.

**Events (`ObserverEvents`)**

- `'newcall' (call: ObservedCall)`
- `'call-updated' (call: ObservedCall)`
- `'client-event' (client: ObservedClient, event: ClientEvent)`
- `'client-issue' (client: ObservedClient, issue: ClientIssue)`
- `'client-metadata' (client: ObservedClient, metadata: ClientMetaData)`
- `'client-extension-stats' (client: ObservedClient, stats: ExtensionStat)`
- `'update' ()`
- `'close' ()`

### 3.2. `ObservedCall`

Represents a single call session.

**Configuration (`ObservedCallSettings`)**

```typescript
export type ObservedCallSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	appData?: AppData;
	updatePolicy?: 'update-on-any-client-updated' | 'update-when-all-client-updated' | 'update-on-interval';
	updateIntervalInMs?: number; // Used if updatePolicy is 'update-on-interval'
	remoteTrackResolvePolicy?: 'mediasoup-sfu'; // For specific SFU integration
};
```

**Key Properties**

- `callId: string`
- `appData: AppData | undefined`
- `numberOfClients: number`
- `score: number | undefined`: Overall call quality score.
- `observedClients: Map<string, ObservedClient>`
- Counters: `totalAddedClients`, `totalRemovedClients`, `numberOfIssues`, RTT buckets, total bytes sent/received (audio/video/data), etc.

**Key Methods**

- `createObservedClient<T>(settings: ObservedClientSettings<T>): ObservedClient<T>`
- `getObservedClient<T>(clientId: string): ObservedClient<T> | undefined`
- `update(): void`
- `close(): void`
- `createEventMonitor<CTX>(ctx?: CTX): ObservedCallEventMonitor<CTX>`

**Events (Emitted via `ObservedCall` instance)**

- `'newclient' (client: ObservedClient)`
- `'empty' ()`: When the last client leaves.
- `'not-empty' ()`: When the first client joins an empty call.
- `'update' ()`
- `'close' ()`

### 3.3. `ObservedClient`

Represents a participant in a call.

**Configuration (`ObservedClientSettings`)**

```typescript
export type ObservedClientSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	clientId: string;
	appData?: AppData;
	// Potentially other client-specific settings
};
```

**Key Properties**

- `clientId: string`
- `call: ObservedCall`: Reference to the parent call.
- `appData: AppData | undefined`
- `score: number | undefined`: Client quality score.
- `numberOfPeerConnections: number`
- `usingTURN: boolean`
- `observedPeerConnections: Map<string, ObservedPeerConnection>`
- Counters: `numberOfIssues`, RTT buckets, total bytes sent/received, `availableIncomingBitrate`, `availableOutgoingBitrate`, etc.

**Key Methods**

- `accept(sample: ClientSample): void`: (Or a similar internal update method called by `Observer.accept` or `ObservedCall`) Processes a `ClientSample` specific to this client, updating its metrics, peer connections, streams, etc. This is the primary point where a client's detailed WebRTC statistics are processed.
- `createObservedPeerConnection<T>(settings: ObservedPeerConnectionSettings<T>): ObservedPeerConnection<T>`
- `getObservedPeerConnection<T>(peerConnectionId: string): ObservedPeerConnection<T> | undefined`
- `update(): void`
- `close(): void`
- `createEventMonitor<CTX>(ctx?: CTX): ObservedClientEventMonitor<CTX>`

**Events (Emitted via `ObservedClient` instance)**

- `'joined' ()`
- `'left' ()`
- `'update' ()`
- `'close' ()`
- `'newpeerconnection' (pc: ObservedPeerConnection)`
- `'issue' (issue: ClientIssue)` (and other specific issue events)

### 3.4. `ObservedPeerConnection`

Represents an `RTCPeerConnection`.

- Tracks ICE connection state, data channel stats, stream stats.
- Holds `ObservedInboundRtpStream`, `ObservedOutboundRtpStream`, and `ObservedDataChannel` instances.

### 3.5. `ObservedInboundRtpStream` / `ObservedOutboundRtpStream`

- Track metrics for individual media streams (audio/video) like codec, packets lost/received, jitter, bytes, etc.

### 3.6. `ObservedDataChannel`

- Tracks metrics for data channels like state, messages sent/received, bytes.

### 3.7. `ClientSample` (Schema)

This is the primary input data structure passed to `observer.accept()`. It's a comprehensive object that should mirror the information obtainable from WebRTC `getStats()` and other client-side states. Key fields include:

- `callId`, `clientId`, `timestamp`
- `peerConnections: RTCPeerConnectionStats[]`
- `inboundRtpStreams: RTCInboundRtpStreamStats[]`
- `outboundRtpStreams: RTCOutboundRtpStreamStats[]`
- `remoteInboundRtpStreams: RTCRemoteInboundRtpStreamStats[]`
- `remoteOutboundRtpStreams: RTCRemoteOutboundRtpStreamStats[]`
- `dataChannels: RTCDataChannelStats[]`
- `iceLocalCandidates: RTCIceCandidateStats[]`, `iceRemoteCandidates: RTCIceCandidateStats[]`, `iceCandidatePairs: RTCIceCandidatePairStats[]`
- `mediaSources: RTCAudioSourceStats[] / RTCVideoSourceStats[]`
- `tracks: RTCMediaStreamTrackStats[]`
- `certificates: RTCCertificateStats[]`
- `codecs: RTCCodecStats[]`
- `transports: RTCIceTransportStats[]` (or similar depending on spec version)
- `browser`, `engine`, `platform`, `os` (client environment metadata)
- `userMediaErrors`, `iceConnectionStates`, `connectionStates` (client-reported events/states)
- `extensionStats` (for custom data)

_(Refer to the [observertc/schemas](https://github.com/observertc/schemas) repository, particularly the `ClientSample.ts` definition, for the exact and complete structure.)_

## 4. Configuration Possibilities

### 4.1. Update Policies

Control how frequently entities re-calculate metrics and emit `update` events.

**Observer Level (`ObserverConfig.updatePolicy`)**

- `'update-on-any-call-updated'`: Observer updates if any of its calls update.
- `'update-when-all-call-updated'`: Observer updates after all its calls update. (Default)
- `'update-on-interval'`: Observer updates at `ObserverConfig.updateIntervalInMs`.

**Call Level (`ObservedCallSettings.updatePolicy` or `ObserverConfig.defaultCallUpdatePolicy`)**

- `'update-on-any-client-updated'`: Call updates if any of its clients update.
- `'update-when-all-client-updated'`: Call updates after all its clients update.
- `'update-on-interval'`: Call updates at its `updateIntervalInMs`.

### 4.2. Intervals

- `ObserverConfig.updateIntervalInMs`
- `ObserverConfig.defaultCallUpdateIntervalInMs`
- `ObservedCallSettings.updateIntervalInMs`

### 4.3. Application Data (`appData`)

Associate custom context with `Observer`, `ObservedCall`, and `ObservedClient` instances using generics.

```typescript
interface MyCallAppData {
	meetingTitle: string;
	scheduledAt: Date;
}
const call = observer.createObservedCall<MyCallAppData>({
	callId: 'call1',
	appData: { meetingTitle: 'Team Sync', scheduledAt: new Date() },
});
console.log(call.appData?.meetingTitle);
```

### 4.4. `appData` vs. Attachments

The `observer-js` library provides two primary ways to associate custom information with its entities: `appData` and `attachments`. Understanding their distinct purposes is key for effective use.

**`appData` (Application Data)**

- **Purpose**: `appData` is designed to hold structured, typed, and relatively static metadata about an entity (`Observer`, `ObservedCall`, `ObservedClient`). This data is typically set at the time of entity creation and is directly accessible as a property of the entity instance.
- **Typing**: It is strongly typed using generics (e.g., `Observer<MyObserverAppData>`). This provides type safety and autocompletion in TypeScript environments.
- **Mutability**: While technically mutable (if the object assigned is mutable), it's generally intended for information that defines or describes the entity and doesn't change frequently during its lifecycle.
- **Accessibility**: Directly accessible via `entity.appData`.
- **Use Cases**:
  - Storing application-specific identifiers (e.g., `userId`, `roomId`, `meetingType`).
  - Configuration flags relevant to how your application interprets this entity.
  - Descriptive information (e.g., `clientDeviceType`, `callRegion`).

**`attachments` (Arbitrary Attachments)**

- **Purpose**: `attachments` (if implemented as a `Map<string, unknown>` or similar mechanism on entities) are meant for associating arbitrary, often dynamic, or less structured data with an entity. This can be useful for temporary state, inter-plugin communication, or data that doesn't fit neatly into a predefined `appData` schema.
- **Typing**: Typically less strictly typed (e.g., `unknown` or `any` values in a Map). Consumers of attachments need to perform their own type checks or assertions.
- **Mutability**: Designed to be more dynamic. Attachments can be added, updated, or removed throughout the entity's lifecycle.
- **Accessibility**: Accessed via methods like `entity.setAttachment(key, value)`, `entity.getAttachment(key)`, `entity.removeAttachment(key)`.
- **Use Cases**:
  - Storing temporary state calculated by one part of your application to be read by another (e.g., a custom issue detector plugin might attach intermediate findings).
  - Caching results of expensive computations related to the entity.
  - Allowing different modules or plugins to associate their own private data with an observer entity without needing to modify its core `appData` type.
  - Storing large binary data or complex objects that are not part of the core descriptive metadata.

**When to Use Which:**

- Use **`appData`** for:
  - Core, descriptive metadata that is known at creation time or changes infrequently.
  - Data that benefits from strong typing and is integral to your application's understanding of the entity.
- Use **`attachments`** for:
  - Dynamic, temporary, or loosely structured data.
  - Data added by different, potentially independent, parts of your system or plugins.
  - Information that doesn't need to be part of the primary, typed `appData` schema.

If `attachments` are not yet a formal feature, this section can serve as a design consideration or be adapted if you introduce such a mechanism. If `attachments` are already present, ensure the description matches their actual implementation.

### 4.5. Remote Track Resolution

For SFU scenarios, especially with MediaSoup:
`ObservedCallSettings.remoteTrackResolvePolicy: 'mediasoup-sfu'`

## 5. Examples

### 5.1. Basic Observer Setup & Sample Ingestion

```typescript
// filepath: /path/to/your/app.ts
import { Observer, ObserverConfig } from '@observertc/observer-js'; // Adjust path
import { ClientSample } from '@observertc/observer-js/dist/schema/ClientSample'; // Adjust path

const observerConfig: ObserverConfig = {
	updatePolicy: 'update-on-interval',
	updateIntervalInMs: 5000,
	defaultCallUpdatePolicy: 'update-on-any-client-updated',
};
const observer = new Observer(observerConfig);

observer.on('newcall', (call) => {
	console.log(`[Observer] New call: ${call.callId}`);
	call.on('update', () => {
		console.log(`[Call: ${call.callId}] Updated. Clients: ${call.numberOfClients}, Score: ${call.score?.toFixed(1)}`);
	});
	call.on('newclient', (client) => {
		console.log(`[Call: ${call.callId}] New client: ${client.clientId}`);
		client.on('update', () => {
			// console.log(`[Client: ${client.clientId}] Updated. Score: ${client.score?.toFixed(1)}`);
		});
		client.on('issue', (issue) => {
			console.warn(`[Client: ${client.clientId}] Issue: ${issue.type} - ${issue.severity} - ${issue.description}`);
		});
	});
});

// Function to transform your app's WebRTC stats to ClientSample
function mapStatsToClientSample(appStats: any, callId: string, clientId: string): ClientSample {
	// Detailed mapping logic here based on ClientSample.ts schema
	return {
		callId,
		clientId,
		timestamp: Date.now(),
		// ... map all relevant stats fields ...
	} as ClientSample; // Ensure all required fields are present
}

// Example: Receiving stats and processing
const rawStatsFromClient = {
	/* ... your client's getStats() output ... */
};
const callId = 'meeting-alpha-123';
const clientId = 'user-xyz-789';
const sample = mapStatsToClientSample(rawStatsFromClient, callId, clientId);
observer.accept(sample);

// Later, on application shutdown:
// observer.close();
```

### 5.2. Manual Call and Client Creation

```typescript
// ... observer setup ...

const call = observer.createObservedCall({
	callId: 'scheduled-webinar-456',
	updatePolicy: 'update-on-interval',
	updateIntervalInMs: 10000,
});

const client1 = call.createObservedClient({ clientId: 'presenter-01' });
// Samples for 'presenter-01' in call 'scheduled-webinar-456' will update this client.
```

### 5.3. Using Event Monitors for Contextual Logging

```typescript
const call = observer.getObservedCall('meeting-alpha-123');
if (call) {
	const callMonitor = call.createEventMonitor({ callId: call.callId, started: new Date() });
	callMonitor.on('client-joined', (client, context) => {
		console.log(`EVENT_MONITOR (${context.callId}): Client ${client.clientId} joined at ${new Date()}`);
	});
	callMonitor.on('issue-detected', (client, issue, context) => {
		console.error(`EVENT_MONITOR (${context.callId}): Issue on ${client.clientId} - ${issue.description}`);
	});
}
```

## 6. Best Practices

- **Resource Management**: Always call `observer.close()`, `call.close()`, and `client.close()` when entities are no longer needed to free resources and stop timers.
- **Error Handling**: Wrap calls to library methods in `try...catch` blocks where appropriate, especially for operations that might throw errors based on state (e.g., creating an entity that already exists if not using `getOrCreate` patterns).
- **Event Listener Cleanup**: If dynamically adding/removing listeners, ensure they are properly removed (e.g., using `emitter.off()` or `emitter.removeListener()`) to prevent memory leaks, especially for short-lived monitored entities.
- **`ClientSample` Accuracy**: The quality of monitoring heavily depends on the completeness and correctness of the `ClientSample` data provided. Ensure thorough mapping from `getStats()`.
- **Update Policies**: Choose update policies carefully based on the desired granularity of updates and performance considerations.

## 7. Troubleshooting

- **Memory Leaks**: Ensure `close()` is called on all entities. Check for unremoved event listeners.
- **No Events / Missing Updates**:
  - Verify `observer.accept()` is being called with correctly formatted `ClientSample` data.
  - Ensure `callId` and `clientId` in samples match expectations.
  - Check if `updatePolicy` and `updateIntervalInMs` are configured as intended.
- **Debugging**: Utilize `console.log` within event handlers at different levels (Observer, Call, Client) to trace data flow and state changes. Use `appData` to add correlation IDs for easier debugging.

## 8. Installation

```bash
npm install @observertc/observer-js
# or
yarn add @observertc/observer-js
```

## 9. TypeScript Support

The library is written in TypeScript and provides type definitions.
Use generics with `Observer`, `ObservedCall`, and `ObservedClient` to type your custom `appData`.

```typescript
interface MyClientAppData {
	userId: string;
	role: 'admin' | 'user';
}
const client = call.createObservedClient<MyClientAppData>({
	clientId: 'user1',
	appData: { userId: 'u-123', role: 'admin' },
});
// client.appData will be typed as MyClientAppData | undefined
```
