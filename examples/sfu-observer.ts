/**
 * End-to-end example: an SFU running observer-js.
 *
 * Shows the whole path in one file — ingest client samples, correlate them across participants,
 * observe the mediasoup side, and react to what the detectors conclude:
 *
 *   ClientSample ──accept()──▶ Observer ──▶ ObservedCall ──▶ detectors ──▶ call-issue
 *                                  │                                       observer-issue
 *   mediasoup Router ──────────────┘
 *
 * Run it with:  npx ts-node examples/sfu-observer.ts
 *
 * It uses synthetic samples so it runs standalone with no SFU and no browsers. The
 * `// in production:` comments mark where you would wire the real thing.
 */
import {
	Observer,
	createDefaultMediasoupRemoteTrackResolverFactory,
	type ClientSample,
} from '../src';

/* ------------------------------------------------------------------------------------------------
 * 1. Create the observer.
 * ---------------------------------------------------------------------------------------------- */

const observer = new Observer({
	// Links each publisher's outbound track to the inbound tracks carrying it. Several detectors
	// are useless without it — they'd see no publisher↔subscriber pairs and stay silent.
	createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),

	// Aggregate when every client in a call has reported; no internal timers are used.
	updatePolicy: 'update-when-all-call-updated',
	defaultCallUpdatePolicy: 'update-when-all-client-updated',

	// Release entities whose clients stopped reporting.
	closeClientIfIdleForMs: 60_000,
	closeCallIfEmptyForMs: 20_000,

	/* --------------------------------------------------------------------------------------------
	 * 2. Configure detectors.
	 *
	 * Every detector is created automatically with defaults — omitting these two keys entirely
	 * would give the same set. Each slot takes an object to override its settings, or `null` to
	 * skip it. Naming one key does not disable the others.
	 *
	 * All of them are issue-driven: they consume the verdicts client-monitor-js >= 4.6.0 already
	 * ships and add the cross-participant conclusion on top.
	 * ------------------------------------------------------------------------------------------ */

	callDetectors: {
		// Tuned for this demo: three participants, and we want a verdict within a couple of ticks.
		concurrentIssueDetector: { minClients: 3, minAffectedClients: 3 },
	},

	observerDetectors: {
		// A single-SFU demo has no fleet to compare against, so the TURN detectors would need a
		// control group they cannot have here.
		turnServerHealthDetector: null,
		turnServerOutageDetector: null,
	},
});

/* ------------------------------------------------------------------------------------------------
 * 3. React to findings.
 * ---------------------------------------------------------------------------------------------- */

// `issue.payload` is the object itself — an observer-raised finding is delivered in-process, so
// nothing is ever serialised on this path.
observer.on('call-issue', ({ observedCall, issue }) => {
	console.log(`[call ${observedCall.callId}] ${issue.type}`, issue.payload);
});

observer.on('observer-issue', ({ issue }) => {
	console.log(`[sfu-wide] ${issue.type}`, issue.payload);
});

// The raw client verdicts, and when each episode ended.
observer.on('client-issue', ({ observedClient, issue }) => {
	console.log(`  client ${observedClient.clientId} raised ${issue.type}`);
});
observer.on('client-issue-resolved', ({ resolvedIssue }) => {
	console.log(`  client ${resolvedIssue.clientId} resolved ${resolvedIssue.type} after ${resolvedIssue.durationInMs}ms`);
});

observer.on('sample-rejected', ({ reason }) => console.warn('sample rejected:', reason));

/* ------------------------------------------------------------------------------------------------
 * 4. Observe the mediasoup side (optional).
 * ---------------------------------------------------------------------------------------------- */

// in production:
//
//   const observedRouter = observer.createObservedMediasoupRouter({
//     router,                                    // your live mediasoup Router
//     matchPeerConnectionByWebRtcTransportId: true,
//     enrich: {
//       // mirror the metadata you already keep on the mediasoup objects
//       producer: (producer) => ({ participantId: producer.appData.participantId }),
//     },
//   });
//
//   observer.on('mediasoup-router-matched-with-peer-connection', ({ observedMediasoupRouter, observedPeerConnection }) => {
//     (observedPeerConnection.appData ??= {}).routerId = observedMediasoupRouter.id;
//   });
//
//   observer.on('mediasoup-router-removed', ({ observedMediasoupRouter }) => {
//     persist(observedMediasoupRouter.snapshot());   // detached copy for your report
//   });

/* ------------------------------------------------------------------------------------------------
 * 5. Feed samples.
 *
 * In production these arrive over your transport (WebSocket, HTTP, a mediasoup DataChannel…) —
 * `observer.accept(sample)` is the only ingestion point. Below they're synthesized: Alice publishes,
 * Bob/Carol/Dave subscribe, and partway through all three stop receiving her track while she keeps
 * sending — the signature of a forwarding fault.
 * ---------------------------------------------------------------------------------------------- */

const CALL_ID = 'demo-call';
const PRODUCER_ID = 'alice-camera';

function publisherSample(timestamp: number, packetsSent: number): ClientSample {
	return {
		callId: CALL_ID,
		clientId: 'alice',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pc-alice',
			// NOTE the media source is what ties an outbound *track* to its outbound *RTP* streams
			// (`mediaSource.trackIdentifier` → `outboundRtp.mediaSourceId`). Without it the track has
			// no RTPs, so "is the publisher sending?" reads as no and the verdicts flip.
			mediaSources: [ { timestamp, id: 'ms-alice', kind: 'video', trackIdentifier: 'alice-video' } ],
			outboundRtps: [ {
				timestamp, id: 'out-1', ssrc: 1, kind: 'video', mediaSourceId: 'ms-alice',
				bytesSent: packetsSent * 1200, packetsSent,
			} ],
			outboundTracks: [ { timestamp, id: 'alice-video', kind: 'video', attachments: { producerId: PRODUCER_ID } } ],
		} ],
	} as ClientSample;
}

function subscriberSample(clientId: string, timestamp: number, packetsReceived: number, dry = false): ClientSample {
	return {
		callId: CALL_ID,
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc-${clientId}`,
			inboundRtps: [ {
				timestamp, id: 'in-1', ssrc: 1, kind: 'video',
				trackIdentifier: `${clientId}-video`,
				bytesReceived: packetsReceived * 1200, packetsReceived, packetsLost: 0,
			} ],
			inboundTracks: [ {
				timestamp, id: `${clientId}-video`, kind: 'video',
				attachments: { producerId: PRODUCER_ID, consumerId: `consumer-${clientId}` },
			} ],
		} ],
		// The client's own verdict. `key` ties the raise to its `<type>-resolved` companion, which is
		// what lets the observer track the issue as an interval rather than a point in time.
		clientIssues: dry
			? [ {
				type: 'dry-inbound-track',
				key: `dry-${clientId}`,
				payload: JSON.stringify({ trackId: `${clientId}-video`, duration: 5000 }),
				timestamp,
			} ]
			: undefined,
	} as ClientSample;
}

const subscribers = [ 'bob', 'carol', 'dave' ];

// tick 1 — everyone healthy. Establishes the counter baselines every delta is measured against.
observer.accept(publisherSample(1_000, 100));
for (const id of subscribers) observer.accept(subscriberSample(id, 1_000, 100));

// tick 2 — Alice is still sending, but nobody is receiving her track any more.
observer.accept(publisherSample(2_000, 400));
for (const id of subscribers) observer.accept(subscriberSample(id, 2_000, 100, true));

// With `update-when-all-client-updated` the call aggregates (and detectors run) once the last
// client of the round has been accepted. Nudge it explicitly so the example is deterministic:
observer.getObservedCall(CALL_ID)?.update();
observer.update();

/* ------------------------------------------------------------------------------------------------
 * 6. Read the live model directly whenever you like — detectors are one consumer of it, not the
 *    only way in.
 * ---------------------------------------------------------------------------------------------- */

const call = observer.getObservedCall(CALL_ID);

console.log('\nlive model:');
console.log('  clients          :', call?.numberOfClients);
console.log('  inbound streams  :', call?.numberOfInboundRtpStreams);
console.log('  outbound streams :', call?.numberOfOutboundRtpStreams);

for (const client of call?.observedClients.values() ?? []) {
	console.log(`  ${client.clientId}: rtt=${client.currentAvgRttInMs ?? '-'}ms activeIssues=${client.activeIssues.size}`);
}

observer.close();
